import { MongoClient, Db, Collection } from "mongodb";
import { config } from "../../../.emacs.d/backup/!home!dprandle!projects!wxstream-remote-sim!src!config.ts~";

export interface raw_audio_entry {
    site_id: string;
    recorded: Date;
    bucket: string;
    object_key: string;
    created: Date;
    last_update: Date;
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

function get_collection(): Collection<raw_audio_entry> {
    if (!db) throw new Error("Database not connected. Call connect_db() first.");
    return db.collection<raw_audio_entry>(config.mongo.collection);
}

export async function insert_raw_audio_entry(entry: raw_audio_entry): Promise<string> {
    const collection = get_collection();
    const result = await collection.insertOne(entry);
    return result.insertedId.toHexString();
}
