#!/bin/sh
# Pass the script name in as the only arguement - this will run that script in mongosh after connecting to the DB
script_fname=$(dirname "$0")/$1
echo "Script: $script_fname"
mongosh "mongodb+srv://remote:btbGU0zv0FCCBYBV@prod.vew9qwt.mongodb.net/" --file $script_fname
