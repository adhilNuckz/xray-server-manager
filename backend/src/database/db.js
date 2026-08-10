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

// Lightweight migrations for databases created before newer columns existed.
function ensureColumn(table, column, definitionSql) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
  }
}
ensureColumn('clients', 'sni', "TEXT NOT NULL DEFAULT ''");

module.exports = db;
