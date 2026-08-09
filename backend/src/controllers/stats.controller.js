const asyncHandler = require('../utils/asyncHandler');
const system = require('../services/system.service');
const traffic = require('../services/traffic.service');
const clientsService = require('../services/clients.service');
const xrayStats = require('../services/xrayStats.service');
const connections = require('../services/connections.service');

const overview = asyncHandler(async (req, res) => {
  const [server, clients] = await Promise.all([system.getServerInfo(), Promise.resolve(clientsService.listClients())]);
  const history = traffic.getHistory();
  const latest = history[history.length - 1] || null;

  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON').length;
  const expiredClients = clients.filter((c) => c.status === 'EXPIRED').length;
  const disabledClients = clients.filter((c) => c.status === 'DISABLED').length;

  res.json({
    server,
    clients: { total: totalClients, active: activeClients, expired: expiredClients, disabled: disabledClients },
    bandwidth: {
      downloadBps: latest ? latest.rxSec : 0,
      uploadBps: latest ? latest.txSec : 0,
      totalBytes: latest ? latest.rxBytes + latest.txBytes : 0,
      activeConnections: latest ? latest.activeConnections : 0,
    },
    statsApi: xrayStats.getStatus(),
    accessLogAvailable: connections.isAccessLogAvailable(),
  });
});

const trafficHistory = asyncHandler(async (req, res) => {
  res.json({ history: traffic.getHistory() });
});

const stream = asyncHandler(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  traffic.addSseClient(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    traffic.removeSseClient(res);
  });
});

const enableStatsApi = asyncHandler(async (req, res) => {
  const audit = require('../services/audit.service');
  try {
    const result = await xrayStats.enableStats();
    audit.log(req.session.user.username, 'xray_stats_api_enabled', result, req.ip);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.validation) return res.status(422).json({ error: err.message, validation: err.validation });
    res.status(500).json({ error: err.message });
  }
});

module.exports = { overview, trafficHistory, stream, enableStatsApi };
