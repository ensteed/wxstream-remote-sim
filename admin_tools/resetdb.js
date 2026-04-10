print("Dropping dbs");
load(__dirname + "/drop-all-dbs.js");

print("Creating db, collections, and indices");
load(__dirname + "/create-db-collections-indices.js");

print("Seeding sites...");
load(__dirname + "/seed-sites.js");

print("Done.");
