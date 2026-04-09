import * as fs from "fs";
import * as path from "path";
import { WaveFile } from "wavefile";
import { config } from "./config.js";
import { upload_chunk } from "./uploader.js";
import { insert_raw_audio_entry } from "./database.js";

interface wav_info {
    sampleRate: number;
    numChannels: number;
    bitsPerSample: number;
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

    const sampleRate: number = fmt.sampleRate;
    const numChannels: number = fmt.numChannels;
    const bitsPerSample: number = fmt.bitsPerSample;

    // getSamples(true) returns a single interleaved typed array
    const raw = wav.getSamples(true, Int16Array) as unknown as Int16Array;
    const samples: number[] = Array.from(raw);

    return { sampleRate, numChannels, bitsPerSample, samples };
}

function build_wav(samples: number[], sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
    const wav = new WaveFile();
    // Split interleaved samples back into per-channel arrays
    const totalFrames = samples.length / numChannels;
    const channels: Int16Array[] = Array.from({ length: numChannels }, () => new Int16Array(totalFrames));
    for (let frame = 0; frame < totalFrames; frame++) {
        for (let ch = 0; ch < numChannels; ch++) {
            channels[ch][frame] = samples[frame * numChannels + ch];
        }
    }
    wav.fromScratch(numChannels, sampleRate, String(bitsPerSample) as "16", channels);
    return Buffer.from(wav.toBuffer());
}

function compute_rms(samples: number[], numChannels: number): number {
    if (samples.length === 0) return 0;
    // Average RMS across all channels in the window
    let sum = 0;
    for (const s of samples) {
        sum += s * s;
    }
    return Math.sqrt(sum / samples.length);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flush_chunk(
    siteId: string,
    chunkSamples: number[],
    chunkStartTime: Date,
    sampleRate: number,
    numChannels: number,
    bitsPerSample: number
): Promise<void> {
    if (chunkSamples.length === 0) return;

    const wavBuffer = build_wav(chunkSamples, sampleRate, numChannels, bitsPerSample);

    console.log(
        `[proc] Flushing chunk: ${chunkSamples.length / numChannels} frames` +
            ` (~${((chunkSamples.length / numChannels / sampleRate) * 1000).toFixed(0)} ms)` +
            ` recorded at ${chunkStartTime.toISOString()}`
    );

    const now = new Date();
    const objectKey = await upload_chunk(siteId, chunkStartTime, wavBuffer);

    await insert_raw_audio_entry({
        site_id: siteId,
        recorded: chunkStartTime,
        bucket: config.aws.bucket,
        object_key: objectKey,
        created: now,
        last_update: now,
    });

    console.log(`[db] Inserted raw audio entry for key: ${objectKey}`);
}

export async function process_audio_file(siteId: string): Promise<void> {
    const streamsDir = path.resolve(process.cwd(), "streams");
    const audioFile = path.join(streamsDir, `${siteId}.wav`);

    if (!fs.existsSync(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
    }

    console.log(`[proc] Loading audio file: ${audioFile}`);
    const { sampleRate, numChannels, bitsPerSample, samples } = load_wav(audioFile);

    const {
        silence_threshold_ms: silenceThresholdMs,
        rms_silence_threshold: rmsSilenceThreshold,
        processing_window_ms: processingWindowMs,
    } = config.audio;

    const framesPerWindow = Math.floor((sampleRate * processingWindowMs) / 1000);
    const samplesPerWindow = framesPerWindow * numChannels;
    const silenceWindowsNeeded = Math.ceil(silenceThresholdMs / processingWindowMs);

    const totalFrames = samples.length / numChannels;
    const durationSec = totalFrames / sampleRate;

    console.log(
        `[proc] ${sampleRate} Hz, ${numChannels} ch, ${bitsPerSample}-bit` +
            ` | ${totalFrames} frames (${durationSec.toFixed(2)}s)` +
            ` | window: ${processingWindowMs}ms (${framesPerWindow} frames)` +
            ` | silence: RMS<${rmsSilenceThreshold} for >${silenceThresholdMs}ms`
    );

    let chunkSamples: number[] = [];
    let chunkStartTime: Date | null = null;
    let silenceWindowCount = 0;

    // Track absolute simulated time for the chunk start
    const fileStartWallTime = Date.now();
    let simulatedElapsedMs = 0;

    for (let offset = 0; offset < samples.length; offset += samplesPerWindow) {
        const windowSamples = samples.slice(offset, offset + samplesPerWindow);
        const rms = compute_rms(windowSamples, numChannels);
        const isSilent = rms < rmsSilenceThreshold;

        if (!isSilent) {
            // Audio is active — accumulate into current chunk
            if (chunkStartTime === null) {
                // New chunk begins; record simulated wall-clock time for this moment
                chunkStartTime = new Date(fileStartWallTime + simulatedElapsedMs);
            }
            chunkSamples.push(...windowSamples);
            silenceWindowCount = 0;
        } else {
            // Silent window
            if (chunkSamples.length > 0) {
                silenceWindowCount++;

                if (silenceWindowCount >= silenceWindowsNeeded) {
                    // Silence threshold reached — flush the accumulated chunk
                    await flush_chunk(siteId, chunkSamples, chunkStartTime!, sampleRate, numChannels, bitsPerSample);
                    chunkSamples = [];
                    chunkStartTime = null;
                    silenceWindowCount = 0;
                } else {
                    // Still within the grace period — keep accumulating silence so the
                    // chunk boundary lands at the silence start, not mid-speech
                    chunkSamples.push(...windowSamples);
                }
            }
            // If chunkSamples is empty we're in leading silence — just advance
        }

        simulatedElapsedMs += processingWindowMs;

        // Simulate real-time pacing: sleep until the simulated time catches up to
        // the wall-clock time we should be at
        const targetWallTime = fileStartWallTime + simulatedElapsedMs;
        const sleepMs = targetWallTime - Date.now();
        if (sleepMs > 0) {
            await sleep(sleepMs);
        }
    }

    // Flush any remaining audio at end-of-file
    if (chunkSamples.length > 0 && chunkStartTime !== null) {
        console.log("[proc] End of file — flushing final chunk");
        await flush_chunk(siteId, chunkSamples, chunkStartTime, sampleRate, numChannels, bitsPerSample);
    }

    console.log("[proc] Audio file processing complete.");
}
