// Create / switch to the database
const dbx = db.getSiblingDB("wxobs-pline");

// Explicitly create collections
dbx.createCollection("sites");
dbx.createCollection("audio_recordings");
dbx.createCollection("transcriptions");
dbx.createCollection("metar_entries");
dbx.createCollection("processing_jobs");

// Show results
print("Database and indexes created for wxobs-pline");
printjson({
  collections: dbx.getCollectionNames(),
  sites_indexes: dbx.sites.getIndexes(),
  audio_recordings_indexes: dbx.audio_recordings.getIndexes(),
  transcriptions_indexes: dbx.transcriptions.getIndexes(),
  metar_entries_indexes: dbx.metar_entries.getIndexes(),
  processing_jobs_indexes: dbx.processing_jobs.getIndexes()
});
