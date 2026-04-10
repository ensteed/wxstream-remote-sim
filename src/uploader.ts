import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.js";

const s3 = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.access_key_id,
        secretAccessKey: config.aws.secret_access_key,
    },
});

/**
 * Uploads a WAV buffer to S3 and returns the object key used.
 */
export async function upload_chunk(site_id: string, recorded_at: Date, wav_buffer: Buffer): Promise<string> {
    const year = recorded_at.getUTCFullYear();
    const month = String(recorded_at.getUTCMonth() + 1).padStart(2, "0");
    const day = String(recorded_at.getUTCDate()).padStart(2, "0");
    const time = [
        String(recorded_at.getUTCHours()).padStart(2, "0"),
        String(recorded_at.getUTCMinutes()).padStart(2, "0"),
        String(recorded_at.getUTCSeconds()).padStart(2, "0"),
        String(recorded_at.getUTCMilliseconds()).padStart(3, "0"),
    ].join("");

    const object_key = `${site_id}/${year}/${month}/${day}/raw/${time}.wav`;

    await s3.send(
        new PutObjectCommand({
            Bucket: config.aws.bucket,
            Key: object_key,
            Body: wav_buffer,
            ContentType: "audio/wav",
        })
    );

    console.log(`[s3] Uploaded s3://${config.aws.bucket}/${object_key} (${wav_buffer.length} bytes)`);
    return object_key;
}
