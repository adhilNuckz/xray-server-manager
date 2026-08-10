const asyncHandler = require('../utils/asyncHandler');
const clientsService = require('../services/clients.service');
const trafficService = require('../services/traffic.service');
const audit = require('../services/audit.service');
const { isValidUUID, isSafeName, sanitizeName } = require('../utils/validators');

function actor(req) {
  return req.session.user.username;
}

function handleConfigError(res, err) {
  if (err.validation) {
    return res.status(422).json({ error: err.message, validation: err.validation });
  }
  return res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
}

const list = asyncHandler(async (req, res) => {
  const clients = clientsService.listClients();
  const traffic = trafficService.getAllClientTraffic();
  const connections = trafficService.getActiveConnectionCounts();
  const enriched = clients.map((c) => ({
    ...c,
    traffic: traffic[c.email] || { uplink: 0, downlink: 0, total: 0 },
    lastSeen: (traffic[c.email] && traffic[c.email].lastSeen) || null,
    activeConnections: connections[c.email] || 0,
  }));
  res.json({ clients: enriched });
});

const getOne = asyncHandler(async (req, res) => {
  const client = clientsService.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const traffic = trafficService.getClientTraffic(client.email);
  res.json({ client: { ...client, traffic } });
});

const create = asyncHandler(async (req, res) => {
  const { name, email, expires_at, notes, flow, sni } = req.body || {};
  const cleanName = sanitizeName(name || email || '');
  if (!isSafeName(cleanName)) {
    return res.status(400).json({ error: 'Client name contains invalid characters' });
  }
  try {
    const created = await clientsService.createClient({
      name: cleanName,
      email,
      expires_at,
      notes: typeof notes === 'string' ? notes.slice(0, 500) : '',
      flow,
      sni,
    });
    audit.log(actor(req), 'client_created', { id: created.client.id, email: created.client.email, sni: created.client.sni }, req.ip);
    res.status(201).json({
      client: created.client,
      reloaded: created.reloaded !== false,
      reloadError: created.reloadError || null,
    });
  } catch (err) {
    return handleConfigError(res, err);
  }
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid client id' });
  const patch = { ...req.body };
  if (patch.name !== undefined) {
    patch.name = sanitizeName(patch.name);
    if (!isSafeName(patch.name)) return res.status(400).json({ error: 'Client name contains invalid characters' });
  }
  try {
    const client = await clientsService.updateClient(id, patch);
    audit.log(actor(req), 'client_updated', { id }, req.ip);
    res.json({ client });
  } catch (err) {
    return handleConfigError(res, err);
  }
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid client id' });
  try {
    await clientsService.deleteClient(id);
    audit.log(actor(req), 'client_deleted', { id }, req.ip);
    res.json({ success: true });
  } catch (err) {
    return handleConfigError(res, err);
  }
});

const enable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid client id' });
  try {
    const client = await clientsService.setEnabled(id, true);
    audit.log(actor(req), 'client_enabled', { id }, req.ip);
    res.json({ client });
  } catch (err) {
    return handleConfigError(res, err);
  }
});

const disable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid client id' });
  try {
    const client = await clientsService.setEnabled(id, false);
    audit.log(actor(req), 'client_disabled', { id }, req.ip);
    res.json({ client });
  } catch (err) {
    return handleConfigError(res, err);
  }
});

const vless = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid client id' });
  try {
    const result = await clientsService.getVlessLink(id);
    res.json(result);
  } catch (err) {
    return handleConfigError(res, err);
  }
});

module.exports = { list, getOne, create, update, remove, enable, disable, vless };
