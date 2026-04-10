import { connect_db, disconnect_db } from "./database.js";
import { process_audio_file } from "./audio_processor.js";

async function main(): Promise<void> {
    const siteId = process.argv[2];
    if (!siteId) {
        console.error("Usage: ts-node src/index.ts <site_id>");
        console.error("  e.g. ts-node src/index.ts KORD");
        process.exit(1);
    }

    console.log(`[main] Starting audio processor for site: ${siteId}`);

    await connect_db();

    try {
        await process_audio_file(siteId);
    } finally {
        await disconnect_db();
    }
}

main().catch((err) => {
    console.error("[main] Fatal error:", err);
    process.exit(1);
});
