import * as fs from "fs";
import * as path from "path";
import { WaveFile } from "wavefile";
import { config } from "./config.js";
import { upload_chunk } from "./uploader.js";
import { insert_raw_audio_entry } from "./database.js";

interface wav_info {
    sample_rate: number;
    num_channels: number;
    bits_per_sample: number;
    samples: number[]; // interleaved samples, normalised to 16-bit range [-32768, 32767]
}

function load_wav(filePath: string): wav_info {
    const buffer = fs.readFileSync(filePath);
    const wav = new WaveFile(buffer);

    const fmt = wav.fmt as {
        sampleRate: number;
        numChannels: number;
        bitsPerSample: number;
    };
    // getSamples(true) returns a single interleaved typed array
    const raw = wav.getSamples(true, Int16Array);
    const samples: number[] = Array.from(raw);
    return { sample_rate: fmt.sampleRate, num_channels: fmt.numChannels, bits_per_sample: fmt.bitsPerSample, samples };
}

function build_wav(samples: number[], sample_rate: number, num_channels: number, bits_per_sample: number): Buffer {
    const wav = new WaveFile();
    // Split interleaved samples back into per-channel arrays
    const total_frames = samples.length / num_channels;
    const channels: Int16Array[] = Array.from({ length: num_channels }, () => new Int16Array(total_frames));
    for (let frame = 0; frame < total_frames; frame++) {
        for (let ch = 0; ch < num_channels; ch++) {
            channels[ch][frame] = samples[frame * num_channels + ch];
        }
    }
    wav.fromScratch(num_channels, sample_rate, String(bits_per_sample) as "16", channels);
    return Buffer.from(wav.toBuffer());
}

function compute_rms(samples: number[], num_channels: number): number {
    if (samples.length === 0) return 0;
    // Average RMS across all channels in the window
    let sum = 0;
    for (const s of samples) {
        sum += s * s;
    }
    const rms_v = Math.sqrt(sum / samples.length);
    const rms_db = 20 * Math.log10(rms_v / 32768);
    return rms_db;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flush_chunk(
    site_id: string,
    chunk_samples: number[],
    chunk_start_time: Date,
    sample_rate: number,
    num_channels: number,
    bits_per_sample: number
): Promise<void> {
    if (chunk_samples.length === 0) return;

    const wavBuffer = build_wav(chunk_samples, sample_rate, num_channels, bits_per_sample);

    console.log(
        `[proc] Flushing chunk: ${chunk_samples.length / num_channels} frames` +
            ` (~${((chunk_samples.length / num_channels / sample_rate) * 1000).toFixed(0)} ms)` +
            ` recorded at ${chunk_start_time.toISOString()}`
    );

    const now = new Date();
    const objectKey = await upload_chunk(site_id, chunk_start_time, wavBuffer);

    await insert_raw_audio_entry({
        site_id: site_id,
        type: "raw",
        recorded: chunk_start_time,
        bucket: config.aws.bucket,
        object_key: objectKey,
        created: now,
        last_update: now,
    });

    console.log(`[db] Inserted raw audio entry for key: ${objectKey}`);
}

export async function process_audio_file(
    site_id: string,
    silence_threshold_ms: number,
    rms_silence_threshold_db: number
): Promise<void> {
    const streams_dir = path.resolve(process.cwd(), "streams");
    const audio_file = path.join(streams_dir, `${site_id}.wav`);

    if (!fs.existsSync(audio_file)) {
        throw new Error(`Audio file not found: ${audio_file}`);
    }

    console.log(`[proc] Loading audio file: ${audio_file}`);
    const { sample_rate, num_channels, bits_per_sample, samples } = load_wav(audio_file);

    const { processing_window_ms } = config.audio;

    const frames_per_window = Math.floor((sample_rate * processing_window_ms) / 1000);
    const samples_per_window = frames_per_window * num_channels;
    const silence_windows_needed = Math.ceil(silence_threshold_ms / processing_window_ms);

    const total_frames = samples.length / num_channels;
    const duration_sec = total_frames / sample_rate;

    console.log(
        `[proc] ${sample_rate} Hz, ${num_channels} ch, ${bits_per_sample}-bit` +
            ` | ${total_frames} frames (${duration_sec.toFixed(2)}s)` +
            ` | window: ${processing_window_ms}ms (${frames_per_window} frames)` +
            ` | silence: RMS<${rms_silence_threshold_db} for >${silence_threshold_ms}ms`
    );

    let chunk_samples: number[] = [];
    let chunk_start_time: Date | null = null;
    let silence_window_count = 0;

    // Track absolute simulated time for the chunk start
    const file_start_wall_time = Date.now();
    let simulated_elapsed_ms = 0;

    for (let offset = 0; offset < samples.length; offset += samples_per_window) {
        const window_samples = samples.slice(offset, offset + samples_per_window);
        const rms = compute_rms(window_samples, num_channels);
        const is_silent = rms < rms_silence_threshold_db;

        if (!is_silent) {
            // Audio is active — accumulate into current chunk
            if (chunk_start_time === null) {
                // New chunk begins; record simulated wall-clock time for this moment
                chunk_start_time = new Date(file_start_wall_time + simulated_elapsed_ms);
            }
            chunk_samples.push(...window_samples);
            silence_window_count = 0;
        } else {
            // Silent window
            if (chunk_samples.length > 0) {
                silence_window_count++;

                if (silence_window_count >= silence_windows_needed) {
                    // Silence threshold reached — flush the accumulated chunk
                    await flush_chunk(
                        site_id,
                        chunk_samples,
                        chunk_start_time!,
                        sample_rate,
                        num_channels,
                        bits_per_sample
                    );
                    chunk_samples = [];
                    chunk_start_time = null;
                    silence_window_count = 0;
                } else {
                    // Still within the grace period — keep accumulating silence so the
                    // chunk boundary lands at the silence start, not mid-speech
                    chunk_samples.push(...window_samples);
                }
            }
            // If chunkSamples is empty we're in leading silence — just advance
        }

        simulated_elapsed_ms += processing_window_ms;

        // Simulate real-time pacing: sleep until the simulated time catches up to
        // the wall-clock time we should be at
        const target_wall_time = file_start_wall_time + simulated_elapsed_ms;
        const sleepMs = target_wall_time - Date.now();
        if (sleepMs > 0) {
            await sleep(sleepMs);
        }
    }

    // Flush any remaining audio at end-of-file
    if (chunk_samples.length > 0 && chunk_start_time !== null) {
        console.log("[proc] End of file — flushing final chunk");
        await flush_chunk(site_id, chunk_samples, chunk_start_time, sample_rate, num_channels, bits_per_sample);
    }

    console.log("[proc] Audio file processing complete.");
}
