import { MongoClient, Db, Collection } from "mongodb";
import { config } from "./config.js";

type audio_type = "raw" | "processed";

export interface raw_audio_entry {
    site_id: string;
    type: audio_type;
    recorded: Date;
    bucket: string;
    object_key: string;
    created_at: Date;
    updated_at: Date;
}

// The only parameters we care about
export interface site_entry {
    _id: string;
    silence_threshold_ms: number;
    rms_silence_threshold_db: number;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect_db(): Promise<void> {
    client = new MongoClient(config.mongo.uri);
    await client.connect();
    db = client.db(config.mongo.db);
    console.log(`[db] Connected to MongoDB: ${config.mongo.db}`);
}

export async function disconnect_db(): Promise<void> {
    if (client) {
        await client.close();
        console.log("[db] Disconnected from MongoDB");
    }
}

function get_audio_collection(): Collection<raw_audio_entry> {
    if (!db) throw new Error("Database not connected. Call connect_db() first.");
    return db.collection<raw_audio_entry>(config.mongo.audio_collection);
}

function get_site_collection(): Collection<site_entry> {
    if (!db) throw new Error("Database not connected. Call connect_db() first.");
    return db.collection<site_entry>(config.mongo.site_collection);
}


export async function insert_raw_audio_entry(entry: raw_audio_entry): Promise<string> {
    const collection = get_audio_collection();
    const result = await collection.insertOne(entry);
    return result.insertedId.toHexString();
}

export async function find_site_entry(site_id: string): Promise<site_entry | null> {
    const collection = get_site_collection();
    const result = await collection.findOne({ _id: site_id });
    return result;
}

