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
export async function upload_chunk(siteId: string, recordedAt: Date, wavBuffer: Buffer): Promise<string> {
    const year = recordedAt.getUTCFullYear();
    const month = String(recordedAt.getUTCMonth() + 1).padStart(2, "0");
    const day = String(recordedAt.getUTCDate()).padStart(2, "0");
    const time = [
        String(recordedAt.getUTCHours()).padStart(2, "0"),
        String(recordedAt.getUTCMinutes()).padStart(2, "0"),
        String(recordedAt.getUTCSeconds()).padStart(2, "0"),
        String(recordedAt.getUTCMilliseconds()).padStart(3, "0"),
    ].join("");

    const objectKey = `${siteId}/${year}/${month}/${day}/raw/${time}.wav`;

    await s3.send(
        new PutObjectCommand({
            Bucket: config.aws.bucket,
            Key: objectKey,
            Body: wavBuffer,
            ContentType: "audio/wav",
        })
    );

    console.log(`[s3] Uploaded s3://${config.aws.bucket}/${objectKey} (${wavBuffer.length} bytes)`);
    return objectKey;
}
