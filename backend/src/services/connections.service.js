// Tracks per-client connection activity by tailing Xray's access log, which
// is the only place Xray-core exposes a source-IP <-> email association.
// This is a best-effort, log-based mechanism - see README "Limitations"
// section. It is NOT a guaranteed real-time connection table.
const fs = require('fs');
const db = require('../database/db');
const xrayConfig = require('./xrayConfig.service');

const INSERT_EVENT = db.prepare(`
  INSERT INTO connection_events (ts, email, source_ip, destination, state) VALUES (?, ?, ?, ?, ?)
`);
const PRUNE = db.prepare(`DELETE FROM connection_events WHERE ts < ?`);
const RECENT_FOR_EMAIL = db.prepare(
  `SELECT * FROM connection_events WHERE email = ? ORDER BY ts DESC LIMIT 200`
);
const RECENT_ALL = db.prepare(`SELECT * FROM connection_events ORDER BY ts DESC LIMIT 500`);
const LAST_SEEN_ALL = db.prepare(`
  SELECT email, MAX(ts) as lastSeen FROM connection_events WHERE email IS NOT NULL GROUP BY email
`);

const LOG_LINE_RE =
  /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})[^\n]*?from\s+([0-9a-fA-F:.[\]]+):\d+\s+accepted\s+(\S+)(?:.*?email:\s*(\S+))?/;

let watchedPath = null;
let readOffset = 0;
const ACTIVE_WINDOW_MS = 90 * 1000; // a connection is "active" if logged within this window

function getAccessLogPath() {
  try {
    const config = xrayConfig.readConfig();
    const p = config.log && config.log.access;
    if (!p || p === 'none') return null;
    return p;
  } catch (_) {
    return null;
  }
}

function processNewLines(text) {
  const lines = text.split('\n');
  const events = [];
  for (const line of lines) {
    const match = LOG_LINE_RE.exec(line);
    if (!match) continue;
    const [, , sourceIp, destination, email] = match;
    events.push({
      ts: new Date().toISOString(),
      email: email || null,
      source_ip: sourceIp,
      destination,
      state: 'accepted',
    });
  }
  if (events.length) {
    const insertMany = db.transaction((rows) => {
      rows.forEach((e) => INSERT_EVENT.run(e.ts, e.email, e.source_ip, e.destination, e.state));
    });
    insertMany(events);
  }
}

function tick() {
  const logPath = getAccessLogPath();
  if (!logPath) return;
  try {
    if (!fs.existsSync(logPath)) return;
    const stat = fs.statSync(logPath);
    if (watchedPath !== logPath) {
      watchedPath = logPath;
      readOffset = stat.size; // start tailing from the end, don't replay entire history
      return;
    }
    if (stat.size < readOffset) {
      readOffset = 0; // log rotated/truncated
    }
    if (stat.size > readOffset) {
      const fd = fs.openSync(logPath, 'r');
      const length = stat.size - readOffset;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, readOffset);
      fs.closeSync(fd);
      readOffset = stat.size;
      processNewLines(buffer.toString('utf8'));
    }
  } catch (err) {
    // Non-fatal: log file may momentarily not exist during rotation.
  }
}

function start() {
  tick();
  const interval = setInterval(tick, 3000);
  interval.unref();
  const pruneInterval = setInterval(() => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    PRUNE.run(cutoff);
  }, 60 * 60 * 1000);
  pruneInterval.unref();
}

function getActiveConnectionCounts() {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const rows = db
    .prepare(`SELECT email, COUNT(DISTINCT source_ip) as cnt FROM connection_events WHERE ts >= ? AND email IS NOT NULL GROUP BY email`)
    .all(cutoff);
  const map = {};
  rows.forEach((r) => {
    map[r.email] = r.cnt;
  });
  return map;
}

function getLastSeenAll() {
  const rows = LAST_SEEN_ALL.all();
  const map = {};
  rows.forEach((r) => {
    map[r.email] = r.lastSeen;
  });
  return map;
}

function getRecentForEmail(email) {
  return RECENT_FOR_EMAIL.all(email);
}

function getRecentAll(limit = 200) {
  return RECENT_ALL.all().slice(0, limit);
}

function isAccessLogAvailable() {
  return getAccessLogPath() !== null;
}

module.exports = {
  start,
  getActiveConnectionCounts,
  getLastSeenAll,
  getRecentForEmail,
  getRecentAll,
  isAccessLogAvailable,
  getAccessLogPath,
};
