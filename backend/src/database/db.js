const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('../config/env');

fs.mkdirSync(env.DATA_DIR, { recursive: true });

const dbPath = path.join(env.DATA_DIR, 'panel.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
