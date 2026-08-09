const asyncHandler = require('../utils/asyncHandler');
const connections = require('../services/connections.service');
const clientsService = require('../services/clients.service');

const list = asyncHandler(async (req, res) => {
  const events = connections.getRecentAll(300);
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

module.exports = { list };
