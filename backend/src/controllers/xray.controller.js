const asyncHandler = require('../utils/asyncHandler');
const xrayProcess = require('../services/xrayProcess.service');
const xrayConfig = require('../services/xrayConfig.service');
const xrayStats = require('../services/xrayStats.service');
const connections = require('../services/connections.service');
const clientsService = require('../services/clients.service');
const audit = require('../services/audit.service');
const { redactSecrets } = require('../utils/redact');

function actor(req) {
  return req.session.user.username;
}

const status = asyncHandler(async (req, res) => {
  const st = await xrayProcess.status();
  res.json(st);
});

const start = asyncHandler(async (req, res) => {
  const result = await xrayProcess.start();
  audit.log(actor(req), 'xray_start', result, req.ip);
  res.json(result);
});

const stop = asyncHandler(async (req, res) => {
  const result = await xrayProcess.stop();
  audit.log(actor(req), 'xray_stop', result, req.ip);
  res.json(result);
});

const restart = asyncHandler(async (req, res) => {
  const result = await xrayProcess.restart();
  audit.log(actor(req), 'xray_restart', result, req.ip);
  res.json(result);
});

const reload = asyncHandler(async (req, res) => {
  const result = await xrayProcess.reload();
  audit.log(actor(req), 'xray_reload', result, req.ip);
  res.json(result);
});

const validate = asyncHandler(async (req, res) => {
  const { content } = req.body || {};
  const jsonString = content !== undefined ? content : xrayConfig.readConfigRaw();
  const result = await xrayConfig.validateJsonString(jsonString);
  res.json(result);
});

const getConfig = asyncHandler(async (req, res) => {
  const reveal = req.query.reveal === 'true';
  const config = xrayConfig.readConfig();
  audit.log(actor(req), reveal ? 'xray_config_viewed_revealed' : 'xray_config_viewed', null, req.ip);
  res.json({ config: reveal ? config : redactSecrets(config), redacted: !reveal });
});

const saveConfig = asyncHandler(async (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a JSON string' });
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return res.status(422).json({ error: 'Invalid JSON', details: err.message });
  }
  try {
    const result = await xrayConfig.writeConfigSafely(parsed);
    clientsService.reconcileFromConfig();
    audit.log(actor(req), 'xray_config_saved', { backup: result.backup }, req.ip);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.validation) return res.status(422).json({ error: err.message, validation: err.validation });
    res.status(500).json({ error: err.message });
  }
});

const enableAccessLog = asyncHandler(async (req, res) => {
  const config = xrayConfig.readConfig();
  config.log = config.log || {};
  config.log.access = config.log.access && config.log.access !== 'none' ? config.log.access : '/var/log/xray/access.log';
  config.log.loglevel = config.log.loglevel || 'info';
  try {
    const result = await xrayConfig.writeConfigSafely(config);
    audit.log(actor(req), 'xray_access_log_enabled', { path: config.log.access }, req.ip);
    res.json({ success: true, path: config.log.access, ...result });
  } catch (err) {
    if (err.validation) return res.status(422).json({ error: err.message, validation: err.validation });
    res.status(500).json({ error: err.message });
  }
});

module.exports = { status, start, stop, restart, reload, validate, getConfig, saveConfig, enableAccessLog };
