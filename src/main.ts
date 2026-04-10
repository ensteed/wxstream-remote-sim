import { connect_db, disconnect_db, find_site_entry, site_entry } from "./database.js";
import { process_audio_file } from "./audio_processor.js";

async function main(): Promise<void> {
    const site_id = process.argv[2];
    if (!site_id) {
        console.error("Usage: ts-node src/index.ts <site_id>");
        console.error("  e.g. ts-node src/index.ts KORD");
        process.exit(1);
    }

    console.log(`[main] Starting audio processor for site: ${site_id}`);

    await connect_db();
    const site: site_entry | null = await find_site_entry(site_id);
    if (!site) {
        throw new Error(`Site not found in database: ${site_id}`);
    }

    try {
        await process_audio_file(site_id, site.silence_threshold_ms, site.rms_silence_threshold_db);
    } finally {
        await disconnect_db();
    }
}

main().catch((err) => {
    console.error("[main] Fatal error:", err);
    process.exit(1);
});
