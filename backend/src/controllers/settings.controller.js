const asyncHandler = require('../utils/asyncHandler');
const settings = require('../services/settings.service');
const audit = require('../services/audit.service');

function actor(req) {
  return req.session.user.username;
}

const getSettings = asyncHandler(async (req, res) => {
  res.json({ settings: settings.getAll() });
});

const updateSettings = asyncHandler(async (req, res) => {
  const { default_flow, max_connections_per_client, server_address } = req.body || {};
  try {
    if (default_flow !== undefined) settings.setDefaultFlow(default_flow);
    if (max_connections_per_client !== undefined) settings.setMaxConnections(max_connections_per_client);
    if (server_address !== undefined) settings.setServerAddress(server_address);
    audit.log(actor(req), 'settings_updated', req.body, req.ip);
    res.json({ settings: settings.getAll() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const updateUsername = asyncHandler(async (req, res) => {
  const { username } = req.body || {};
  try {
    settings.setAdminUsername(username);
    audit.log(actor(req), 'admin_username_changed', { username }, req.ip);
    res.json({ settings: settings.getAll() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = { getSettings, updateSettings, updateUsername };
