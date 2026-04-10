const fs = require('fs');

const data = JSON.parse(fs.readFileSync(__dirname + '/sites.json', 'utf-8'));
const BATCH_SIZE = 1000;
const dbx = db.getSiblingDB("wxobs-pline");

for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const now = new Date();
    batch.forEach(site => {
        site.created_at = now;
        site.updated_at = now;
    });
    dbx.sites.insertMany(batch);
    print(`Inserted ${i + batch.length}/${data.length}`);
}
