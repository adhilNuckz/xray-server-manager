const asyncHandler = require('../utils/asyncHandler');
const settings = require('../services/settings.service');
const realityInbounds = require('../services/realityInbounds.service');
const audit = require('../services/audit.service');

function actor(req) {
  return req.session.user.username;
}

const getSettings = asyncHandler(async (req, res) => {
  res.json({ settings: settings.getAll() });
});

const updateSettings = asyncHandler(async (req, res) => {
  const {
    default_flow,
    max_connections_per_client,
    server_address,
    reality_server_names,
    reality_inbounds,
  } = req.body || {};
  try {
    if (default_flow !== undefined) settings.setDefaultFlow(default_flow);
    if (max_connections_per_client !== undefined) settings.setMaxConnections(max_connections_per_client);
    if (server_address !== undefined) settings.setServerAddress(server_address);

    let realitySync = null;
    if (reality_inbounds !== undefined) {
      realitySync = await realityInbounds.setRealityInbounds(reality_inbounds, { syncToXray: true });
    } else if (reality_server_names !== undefined) {
      realitySync = await settings.setRealityServerNames(reality_server_names, { syncToXray: true });
    }

    audit.log(actor(req), 'settings_updated', req.body, req.ip);
    res.json({
      settings: settings.getAll(),
      realitySync: realitySync
        ? {
            synced: realitySync.synced,
            profiles: realitySync.profiles || realitySync.names || null,
            reloaded: realitySync.reloaded,
            reloadError: realitySync.reloadError || null,
          }
        : null,
    });
  } catch (err) {
    if (err.validation) return res.status(422).json({ error: err.message, validation: err.validation });
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
