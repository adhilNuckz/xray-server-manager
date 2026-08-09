const db = require('../database/db');

const INSERT = db.prepare(`
  INSERT INTO audit_logs (ts, actor, action, details, ip) VALUES (?, ?, ?, ?, ?)
`);
const RECENT = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?');

function log(actor, action, details, ip) {
  try {
    INSERT.run(
      new Date().toISOString(),
      actor || 'unknown',
      action,
      details ? JSON.stringify(details) : null,
      ip || null
    );
  } catch (err) {
    // Auditing must never break the request that triggered it.
    console.error('Failed to write audit log entry:', err.message);
  }
}

function recent(limit = 200) {
  return RECENT.all(limit).map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null,
  }));
}

module.exports = { log, recent };
