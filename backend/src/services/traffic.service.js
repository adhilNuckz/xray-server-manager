// Orchestrates periodic polling of real traffic/bandwidth data and keeps a
// short in-memory history for live dashboard charts, plus persists
// snapshots to SQLite for the historical /api/stats/traffic endpoint.
const db = require('../database/db');
const system = require('./system.service');
const xrayStats = require('./xrayStats.service');
const connections = require('./connections.service');
const xrayConfig = require('./xrayConfig.service');
const { findVlessInbounds } = require('../utils/vlessLink');

const POLL_MS = 1000; // 1-second real-time resolution
const HISTORY_POINTS = 300; // 5 minutes at 1s resolution

const INSERT_SNAPSHOT = db.prepare(`
  INSERT INTO traffic_snapshots (ts, scope, ref, uplink, downlink) VALUES (?, ?, ?, ?, ?)
`);
const PRUNE_SNAPSHOTS = db.prepare(`DELETE FROM traffic_snapshots WHERE ts < ?`);
const CLIENT_HISTORY = db.prepare(`
  SELECT ts, uplink, downlink FROM traffic_snapshots WHERE scope = 'client' AND ref = ? ORDER BY ts ASC LIMIT 500
`);

const history = []; // ring buffer of { ts, rxSec, txSec, activeConnections, statsEnabled }
let latestClientTraffic = {}; // email -> { uplink, downlink, total }
let previousClientTraffic = {}; // email -> { uplink, downlink, ts }
const clientSpeeds = {}; // email -> { upSpeed, downSpeed, history: [] }
const sseClients = new Set();
const clientSseClients = new Map(); // email -> Set<res>

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

function broadcastToClient(email, data) {
  const set = clientSseClients.get(email);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch (_) {
      set.delete(res);
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
  const now = Date.now();
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

    // Calculate per-client live speed and push to client history
    Object.entries(statsResult.byEmail).forEach(([email, v]) => {
      const prev = previousClientTraffic[email];
      let upSpeed = 0;
      let downSpeed = 0;
      if (prev) {
        const dt = Math.max(0.5, (now - prev.ts) / 1000);
        if (v.uplink >= prev.uplink) {
          upSpeed = Math.round((v.uplink - prev.uplink) / dt);
        }
        if (v.downlink >= prev.downlink) {
          downSpeed = Math.round((v.downlink - prev.downlink) / dt);
        }
      }
      previousClientTraffic[email] = { uplink: v.uplink, downlink: v.downlink, ts: now };

      if (!clientSpeeds[email]) {
        clientSpeeds[email] = { upSpeed: 0, downSpeed: 0, history: [] };
      }
      clientSpeeds[email].upSpeed = upSpeed;
      clientSpeeds[email].downSpeed = downSpeed;
      clientSpeeds[email].history.push({
        ts,
        upSpeed,
        downSpeed,
        uplink: v.uplink,
        downlink: v.downlink,
      });
      if (clientSpeeds[email].history.length > 60) {
        clientSpeeds[email].history.shift();
      }

      broadcastToClient(email, {
        ts,
        uplink: v.uplink,
        downlink: v.downlink,
        total: v.uplink + v.downlink,
        upSpeed,
        downSpeed,
      });
    });

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

function addClientSse(email, res) {
  if (!clientSseClients.has(email)) {
    clientSseClients.set(email, new Set());
  }
  clientSseClients.get(email).add(res);
}

function removeClientSse(email, res) {
  const set = clientSseClients.get(email);
  if (set) {
    set.delete(res);
    if (set.size === 0) clientSseClients.delete(email);
  }
}

function getClientLiveSpeed(email) {
  const s = clientSpeeds[email];
  return {
    upSpeed: s ? s.upSpeed : 0,
    downSpeed: s ? s.downSpeed : 0,
    speedHistory: s ? s.history : [],
  };
}

function getAllClientTraffic() {
  const lastSeenMap = connections.getLastSeenAll();
  const result = {};
  Object.entries(latestClientTraffic).forEach(([email, v]) => {
    const s = clientSpeeds[email] || { upSpeed: 0, downSpeed: 0 };
    result[email] = {
      uplink: v.uplink,
      downlink: v.downlink,
      total: v.uplink + v.downlink,
      upSpeed: s.upSpeed,
      downSpeed: s.downSpeed,
      lastSeen: lastSeenMap[email] || null,
    };
  });
  // Include clients with lastSeen but no traffic data yet (stats API just enabled)
  Object.entries(lastSeenMap).forEach(([email, lastSeen]) => {
    if (!result[email]) result[email] = { uplink: 0, downlink: 0, total: 0, upSpeed: 0, downSpeed: 0, lastSeen };
  });
  return result;
}

function getClientTraffic(email) {
  const current = latestClientTraffic[email] || { uplink: 0, downlink: 0 };
  const lastSeenMap = connections.getLastSeenAll();
  const rows = CLIENT_HISTORY.all(email);
  const live = getClientLiveSpeed(email);
  return {
    uplink: current.uplink,
    downlink: current.downlink,
    total: current.uplink + current.downlink,
    upSpeed: live.upSpeed,
    downSpeed: live.downSpeed,
    speedHistory: live.speedHistory,
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
  addClientSse,
  removeClientSse,
  getClientLiveSpeed,
  getAllClientTraffic,
  getClientTraffic,
  getActiveConnectionCounts,
  isStatsApiEnabled,
};
