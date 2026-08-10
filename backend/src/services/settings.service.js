// Mutable panel settings stored in SQLite, layered on top of the .env
// defaults. This is NOT a general auth-database system (per spec) - it only
// allows the single admin account's credentials and a handful of operational
// knobs to be changed from the UI without editing files on the server.
const db = require('../database/db');
const env = require('../config/env');
const { isValidSni } = require('../utils/validators');

const GET = db.prepare('SELECT value FROM settings WHERE key = ?');
const SET = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const ALL = db.prepare('SELECT key, value FROM settings');

const VALID_MAX_CONNECTIONS = ['1', '2', '3', '5', 'unlimited'];
const DEFAULT_REALITY_SNI = 'support.zoom.us';

function get(key, fallback = null) {
  const row = GET.get(key);
  return row ? row.value : fallback;
}

function set(key, value) {
  SET.run(key, String(value));
}

function normalizeServerNames(input) {
  const list = Array.isArray(input)
    ? input
    : typeof input === 'string'
    ? input.split(/[\n,]+/)
    : [];
  const cleaned = [];
  const seen = new Set();
  for (const raw of list) {
    const name = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, '');
    if (!name) continue;
    if (!isValidSni(name)) {
      throw new Error(`Invalid server name / SNI: ${raw}`);
    }
    if (seen.has(name)) continue;
    seen.add(name);
    cleaned.push(name);
  }
  if (cleaned.length === 0) {
    throw new Error('At least one Reality server name is required');
  }
  if (cleaned.length > 20) {
    throw new Error('Too many server names (max 20)');
  }
  return cleaned;
}

function readServerNamesFromLiveConfig() {
  try {
    const xrayConfig = require('./xrayConfig.service');
    if (!xrayConfig.configExists()) return null;
    const config = xrayConfig.readConfig();
    const names = [];
    for (const ib of config.inbounds || []) {
      const rs = ib.streamSettings && ib.streamSettings.realitySettings;
      if (ib.protocol === 'vless' && ib.streamSettings && ib.streamSettings.security === 'reality' && rs) {
        if (Array.isArray(rs.serverNames)) names.push(...rs.serverNames);
      }
    }
    if (names.length) return normalizeServerNames(names);
  } catch (_) {
    /* ignore — fall back to default */
  }
  return null;
}

function getRealityServerNames() {
  try {
    const realityInbounds = require('./realityInbounds.service');
    const names = realityInbounds.getAllServerNames();
    if (names && names.length) return names;
  } catch (_) {
    /* fall through */
  }
  const raw = get('reality_server_names', null);
  if (raw) {
    try {
      return normalizeServerNames(JSON.parse(raw));
    } catch (_) {
      /* fall through */
    }
  }
  const fromConfig = readServerNamesFromLiveConfig();
  if (fromConfig && fromConfig.length) {
    set('reality_server_names', JSON.stringify(fromConfig));
    return fromConfig;
  }
  return [DEFAULT_REALITY_SNI];
}

async function setRealityServerNames(names, { syncToXray = true } = {}) {
  // Back-compat: if only a flat name list is provided, keep the first Reality
  // inbound's dest/port and just replace its serverNames.
  const realityInbounds = require('./realityInbounds.service');
  const cleaned = normalizeServerNames(names);
  const existing = realityInbounds.getRealityInbounds();
  const next = existing.length
    ? existing.map((p, idx) => (idx === 0 ? { ...p, serverNames: cleaned } : p))
    : [
        {
          id: 'zoom',
          label: 'Zoom',
          port: 443,
          dest: `${cleaned[0]}:443`,
          serverNames: cleaned,
        },
      ];
  // Unique SNIs across packs — if flat list replaces only pack 0, drop
  // overlapping names from other packs.
  const primary = new Set(cleaned);
  const adjusted = next.map((p, idx) =>
    idx === 0 ? p : { ...p, serverNames: p.serverNames.filter((n) => !primary.has(n)) }
  ).filter((p) => p.serverNames.length > 0);
  return realityInbounds.setRealityInbounds(adjusted, { syncToXray });
}

function getAll() {
  const rows = ALL.all();
  const map = {};
  rows.forEach((r) => {
    map[r.key] = r.value;
  });
  let reality_inbounds = [];
  try {
    reality_inbounds = require('./realityInbounds.service').getRealityInbounds();
  } catch (_) {
    reality_inbounds = [];
  }
  return {
    panel_port: env.PANEL_PORT,
    server_address: map.server_address || env.SERVER_ADDRESS,
    xray_binary: env.XRAY_BINARY, // filesystem paths are not user-editable at runtime for safety
    xray_config: env.XRAY_CONFIG,
    default_flow: map.default_flow || 'xtls-rprx-vision',
    max_connections_per_client: map.max_connections_per_client || '1',
    reality_server_names: getRealityServerNames(),
    reality_inbounds,
    reality_presets: require('./realityInbounds.service').PRESETS,
    admin_username: map.admin_username || env.ADMIN_USERNAME,
    admin_password_overridden: !!map.admin_password_hash,
  };
}

function setDefaultFlow(flow) {
  if (!['xtls-rprx-vision', 'none'].includes(flow)) throw new Error('Invalid flow');
  set('default_flow', flow);
}

function setMaxConnections(value) {
  const v = String(value).toLowerCase();
  if (!VALID_MAX_CONNECTIONS.includes(v)) throw new Error('Invalid max connections value');
  set('max_connections_per_client', v);
}

function setServerAddress(address) {
  if (!address || typeof address !== 'string' || address.length > 255) throw new Error('Invalid server address');
  set('server_address', address.trim());
}

function getEffectiveAdminUsername() {
  return get('admin_username', env.ADMIN_USERNAME);
}

function getEffectiveAdminPasswordHash() {
  return get('admin_password_hash', null);
}

function setAdminUsername(username) {
  if (!username || username.length < 3 || username.length > 64) throw new Error('Invalid username');
  set('admin_username', username);
}

function setAdminPasswordHash(hash) {
  set('admin_password_hash', hash);
}

module.exports = {
  get,
  set,
  getAll,
  setDefaultFlow,
  setMaxConnections,
  setServerAddress,
  getRealityServerNames,
  setRealityServerNames,
  normalizeServerNames,
  getEffectiveAdminUsername,
  getEffectiveAdminPasswordHash,
  setAdminUsername,
  setAdminPasswordHash,
  VALID_MAX_CONNECTIONS,
  DEFAULT_REALITY_SNI,
};
