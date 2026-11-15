const asyncHandler = require('../utils/asyncHandler');
const connections = require('../services/connections.service');
const clientsService = require('../services/clients.service');

const list = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const ip = req.query.ip ? req.query.ip.trim() : null;
  const email = req.query.email ? req.query.email.trim() : null;

  const events = connections.getEvents({ ip, email, limit });
  const clients = clientsService.listClients();
  const byEmail = {};
  clients.forEach((c) => {
    byEmail[c.email] = c;
  });

  const enriched = events.map((e) => ({
    ...e,
    clientName: byEmail[e.email] ? byEmail[e.email].name : null,
    clientId: byEmail[e.email] ? byEmail[e.email].id : null,
  }));

  res.json({
    connections: enriched,
    accessLogAvailable: connections.isAccessLogAvailable(),
    accessLogPath: connections.getAccessLogPath(),
  });
});

const active = asyncHandler(async (req, res) => {
  const windowSeconds = Math.min(Math.max(parseInt(req.query.window, 10) || 90, 10), 600);
  const rows = connections.getActiveConnections(windowSeconds * 1000);
  const clients = clientsService.listClients();
  const byEmail = {};
  clients.forEach((c) => {
    byEmail[c.email] = c;
  });

  const activeConnections = rows.map((r) => ({
    email: r.email,
    clientName: byEmail[r.email] ? byEmail[r.email].name : null,
    clientId: byEmail[r.email] ? byEmail[r.email].id : null,
    sourceIp: r.source_ip,
    destination: r.destination,
    lastSeen: r.last_seen,
    requestCount: r.count,
  }));

  const uniqueIps = new Set(rows.map((r) => r.source_ip));
  const uniqueEmails = new Set(rows.map((r) => r.email));

  res.json({
    activeConnections,
    totalActiveUsers: uniqueEmails.size,
    totalActiveIps: uniqueIps.size,
    windowSeconds,
    accessLogAvailable: connections.isAccessLogAvailable(),
  });
});

module.exports = { list, active };
