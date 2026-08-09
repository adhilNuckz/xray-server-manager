// Integrates with Xray's built-in Stats API (gRPC) via the `xray api
// statsquery` CLI subcommand. This is the ONLY reliable, officially
// supported way to get per-client (per-email) traffic counters out of
// Xray-core - it requires the config to expose an `api` inbound + `stats` +
// `policy` blocks. If those are missing, per-client traffic is NOT
// available and we say so explicitly rather than inventing numbers.
const { execFile } = require('child_process');
const env = require('../config/env');
const xrayConfig = require('./xrayConfig.service');

const API_TAG = 'api';
const API_PORT = 10085;

function findApiInboundPort(config) {
  const inbound = (config.inbounds || []).find((ib) => ib.tag === API_TAG && ib.protocol === 'dokodemo-door');
  return inbound ? inbound.port : null;
}

function isStatsEnabled(config) {
  return Boolean(
    config.api &&
      Array.isArray(config.api.services) &&
      config.api.services.includes('StatsService') &&
      config.stats !== undefined &&
      findApiInboundPort(config)
  );
}

function getStatus() {
  const config = xrayConfig.readConfig();
  return { enabled: isStatsEnabled(config), apiPort: findApiInboundPort(config) };
}

// Adds the minimal official blocks required for the Stats API to work,
// through the same validate -> backup -> atomic-replace pipeline used for
// every other config mutation. Never touches existing inbounds/outbounds.
async function enableStats() {
  const config = xrayConfig.readConfig();
  if (isStatsEnabled(config)) return { alreadyEnabled: true };

  config.api = config.api || {};
  config.api.tag = API_TAG;
  config.api.services = Array.from(new Set([...(config.api.services || []), 'StatsService']));

  config.stats = config.stats || {};

  config.policy = config.policy || {};
  config.policy.levels = config.policy.levels || {};
  config.policy.levels['0'] = {
    ...(config.policy.levels['0'] || {}),
    statsUserUplink: true,
    statsUserDownlink: true,
  };
  config.policy.system = {
    ...(config.policy.system || {}),
    statsInboundUplink: true,
    statsInboundDownlink: true,
    statsOutboundUplink: true,
    statsOutboundDownlink: true,
  };

  config.inbounds = config.inbounds || [];
  if (!findApiInboundPort(config)) {
    config.inbounds.push({
      listen: '127.0.0.1',
      port: API_PORT,
      protocol: 'dokodemo-door',
      settings: { address: '127.0.0.1' },
      tag: API_TAG,
    });
  }

  config.routing = config.routing || { rules: [] };
  config.routing.rules = config.routing.rules || [];
  if (!config.routing.rules.some((r) => r.inboundTag && r.inboundTag.includes(API_TAG))) {
    config.routing.rules.unshift({ type: 'field', inboundTag: [API_TAG], outboundTag: API_TAG });
  }

  // Per-client stats require each client to opt in - Xray enables this
  // automatically for level "0" clients (the default, used by every VLESS
  // inbound this panel manages), so no per-inbound changes are needed here.

  const result = await xrayConfig.writeConfigSafely(config);
  return { alreadyEnabled: false, ...result };
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

// Returns { system: {uplink, downlink}, byEmail: { email: {uplink, downlink} } }
// or null if the Stats API is not enabled / not reachable.
async function queryStats() {
  const config = xrayConfig.readConfig();
  if (!isStatsEnabled(config)) return null;
  const port = findApiInboundPort(config);

  const { error, stdout } = await run(env.XRAY_BINARY, [
    'api',
    'statsquery',
    `--server=127.0.0.1:${port}`,
  ]);
  if (error) return null;

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (_) {
    return null;
  }

  const stats = parsed.stat || parsed.Stat || [];
  const byEmail = {};
  let systemUplink = 0;
  let systemDownlink = 0;

  for (const entry of stats) {
    const name = entry.name || entry.Name;
    const value = Number(entry.value || entry.Value || 0);
    if (!name) continue;
    const userMatch = /^user>>>(.+?)>>>traffic>>>(uplink|downlink)$/.exec(name);
    if (userMatch) {
      const [, email, direction] = userMatch;
      byEmail[email] = byEmail[email] || { uplink: 0, downlink: 0 };
      byEmail[email][direction] = value;
      continue;
    }
    const inboundMatch = /^inbound>>>(.+?)>>>traffic>>>(uplink|downlink)$/.exec(name);
    if (inboundMatch) {
      if (inboundMatch[2] === 'uplink') systemUplink += value;
      else systemDownlink += value;
    }
  }

  return { system: { uplink: systemUplink, downlink: systemDownlink }, byEmail };
}

module.exports = { isStatsEnabled, getStatus, enableStats, queryStats, findApiInboundPort };
