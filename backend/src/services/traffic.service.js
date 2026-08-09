// Orchestrates periodic polling of real traffic/bandwidth data and keeps a
// short in-memory history for live dashboard charts, plus persists
// snapshots to SQLite for the historical /api/stats/traffic endpoint.
const db = require('../database/db');
const system = require('./system.service');
const xrayStats = require('./xrayStats.service');
const connections = require('./connections.service');
const xrayConfig = require('./xrayConfig.service');
const { findVlessInbounds } = require('../utils/vlessLink');

const POLL_MS = 5000;
const HISTORY_POINTS = 240; // 20 minutes at 5s resolution

const INSERT_SNAPSHOT = db.prepare(`
  INSERT INTO traffic_snapshots (ts, scope, ref, uplink, downlink) VALUES (?, ?, ?, ?, ?)
`);
const PRUNE_SNAPSHOTS = db.prepare(`DELETE FROM traffic_snapshots WHERE ts < ?`);
const CLIENT_HISTORY = db.prepare(`
  SELECT ts, uplink, downlink FROM traffic_snapshots WHERE scope = 'client' AND ref = ? ORDER BY ts ASC LIMIT 500
`);

const history = []; // ring buffer of { ts, rxSec, txSec, activeConnections, statsEnabled }
let latestClientTraffic = {}; // email -> { uplink, downlink, total }
const sseClients = new Set();

function pushHistory(point) {
  history.push(point);
  if (history.length > HISTORY_POINTS) history.shift();
}

function broadcast(point) {
  const payload = `data: ${JSON.stringify(point)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

async function pollOnce() {
  const [net, statsResult] = await Promise.all([
    system.getNetworkThroughput().catch(() => null),
    xrayStats.queryStats().catch(() => null),
  ]);

  let vlessPorts = [];
  try {
    const config = xrayConfig.readConfig();
    vlessPorts = findVlessInbounds(config).map((ib) => ib.port);
  } catch (_) {
    /* ignore */
  }
  const perPortCounts = await Promise.all(
    vlessPorts.map((port) => system.countEstablishedConnections(port).catch(() => 0))
  );
  const activeConnections = perPortCounts.reduce((sum, n) => sum + n, 0);

  const ts = new Date().toISOString();
  const point = {
    ts,
    rxSec: net ? Math.round(net.rxSec) : 0,
    txSec: net ? Math.round(net.txSec) : 0,
    rxBytes: net ? net.rxBytes : 0,
    txBytes: net ? net.txBytes : 0,
    activeConnections,
    statsApiEnabled: !!statsResult,
  };
  pushHistory(point);
  broadcast(point);

  if (statsResult) {
    latestClientTraffic = statsResult.byEmail;
    const insertMany = db.transaction(() => {
      INSERT_SNAPSHOT.run(ts, 'system', null, statsResult.system.uplink, statsResult.system.downlink);
      Object.entries(statsResult.byEmail).forEach(([email, v]) => {
        INSERT_SNAPSHOT.run(ts, 'client', email, v.uplink, v.downlink);
      });
    });
    insertMany();
  }
}

function start() {
  pollOnce();
  const interval = setInterval(() => pollOnce().catch(() => {}), POLL_MS);
  interval.unref();
  const pruneInterval = setInterval(() => {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    PRUNE_SNAPSHOTS.run(cutoff);
  }, 60 * 60 * 1000);
  pruneInterval.unref();
}

function getHistory() {
  return history;
}

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

function getAllClientTraffic() {
  const lastSeenMap = connections.getLastSeenAll();
  const result = {};
  Object.entries(latestClientTraffic).forEach(([email, v]) => {
    result[email] = {
      uplink: v.uplink,
      downlink: v.downlink,
      total: v.uplink + v.downlink,
      lastSeen: lastSeenMap[email] || null,
    };
  });
  // Include clients with lastSeen but no traffic data yet (stats API just enabled)
  Object.entries(lastSeenMap).forEach(([email, lastSeen]) => {
    if (!result[email]) result[email] = { uplink: 0, downlink: 0, total: 0, lastSeen };
  });
  return result;
}

function getClientTraffic(email) {
  const current = latestClientTraffic[email] || { uplink: 0, downlink: 0 };
  const lastSeenMap = connections.getLastSeenAll();
  const rows = CLIENT_HISTORY.all(email);
  return {
    uplink: current.uplink,
    downlink: current.downlink,
    total: current.uplink + current.downlink,
    lastSeen: lastSeenMap[email] || null,
    history: rows,
  };
}

function getActiveConnectionCounts() {
  return connections.getActiveConnectionCounts();
}

function isStatsApiEnabled() {
  const last = history[history.length - 1];
  return last ? last.statsApiEnabled : false;
}

module.exports = {
  start,
  getHistory,
  addSseClient,
  removeSseClient,
  getAllClientTraffic,
  getClientTraffic,
  getActiveConnectionCounts,
  isStatsApiEnabled,
};
