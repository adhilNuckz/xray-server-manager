// Mutable panel settings stored in SQLite, layered on top of the .env
// defaults. This is NOT a general auth-database system (per spec) - it only
// allows the single admin account's credentials and a handful of operational
// knobs to be changed from the UI without editing files on the server.
const db = require('../database/db');
const env = require('../config/env');

const GET = db.prepare('SELECT value FROM settings WHERE key = ?');
const SET = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const ALL = db.prepare('SELECT key, value FROM settings');

const VALID_MAX_CONNECTIONS = ['1', '2', '3', '5', 'unlimited'];

function get(key, fallback = null) {
  const row = GET.get(key);
  return row ? row.value : fallback;
}

function set(key, value) {
  SET.run(key, String(value));
}

function getAll() {
  const rows = ALL.all();
  const map = {};
  rows.forEach((r) => {
    map[r.key] = r.value;
  });
  return {
    panel_port: env.PANEL_PORT,
    server_address: map.server_address || env.SERVER_ADDRESS,
    xray_binary: env.XRAY_BINARY, // filesystem paths are not user-editable at runtime for safety
    xray_config: env.XRAY_CONFIG,
    default_flow: map.default_flow || 'xtls-rprx-vision',
    max_connections_per_client: map.max_connections_per_client || '1',
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
  getEffectiveAdminUsername,
  getEffectiveAdminPasswordHash,
  setAdminUsername,
  setAdminPasswordHash,
  VALID_MAX_CONNECTIONS,
};
