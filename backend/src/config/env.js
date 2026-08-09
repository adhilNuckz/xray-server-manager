// Central place where all environment configuration is loaded.
// This is the "clearly separated configuration section" for hardcoded
// credentials required by the spec (Phase 1, no auth database yet).
const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

function resolveFromRoot(p, fallback) {
  const value = p || fallback;
  return path.isAbsolute(value) ? value : path.resolve(ROOT_DIR, value);
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  ROOT_DIR,

  PANEL_PORT: parseInt(process.env.PANEL_PORT, 10) || 5252,

  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!',

  XRAY_BINARY: process.env.XRAY_BINARY || '/usr/local/bin/xray',
  XRAY_CONFIG: process.env.XRAY_CONFIG || '/usr/local/etc/xray/config.json',
  XRAY_SYSTEMD_SERVICE: process.env.XRAY_SYSTEMD_SERVICE || 'xray',

  SERVER_ADDRESS: process.env.SERVER_ADDRESS || '',

  SESSION_SECRET: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',

  DATA_DIR: resolveFromRoot(process.env.DATA_DIR, './data'),
  BACKUPS_DIR: resolveFromRoot(process.env.BACKUPS_DIR, './backups'),

  FRONTEND_DIST: path.resolve(ROOT_DIR, 'frontend', 'dist'),
};

env.isProduction = env.NODE_ENV === 'production';

module.exports = env;
