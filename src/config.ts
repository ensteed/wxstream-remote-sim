import * as dotenv from "dotenv";
dotenv.config();

function require_env(name: string): string {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
}

function require_env_number(name: string): number {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return parseInt(val);
}

export const config = {
    aws: {
        access_key_id: require_env("AWS_ACCESS_KEY_ID"),
        secret_access_key: require_env("AWS_SECRET_ACCESS_KEY"),
        region: require_env("AWS_REGION"),
        bucket: require_env("S3_BUCKET"),
    },
    mongo: {
        uri: require_env("MONGODB_URI"),
        db: require_env("MONGODB_DB"),
        collection: require_env("MONGODB_COLLECTION"),
    },
    audio: {
        silence_threshold_ms: require_env_number("SILENCE_THRESHOLD_MS"),
        rms_silence_threshold: require_env_number("RMS_SILENCE_THRESHOLD"),
        processing_window_ms: require_env_number("PROCESSING_WINDOW_MS"),
    },
} as const;
