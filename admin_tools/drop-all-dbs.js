// drop_all_dbs.js
const dbs = db.adminCommand({ listDatabases: 1 }).databases;

dbs.forEach(d => {
  if (!["admin", "local", "config"].includes(d.name)) {
    print(`Dropping ${d.name}...`);
    db.getSiblingDB(d.name).dropDatabase();
  }
});
