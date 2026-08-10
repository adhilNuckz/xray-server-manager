// Safe read/write/backup/validate pipeline for the Xray JSON configuration.
//
// Golden rule enforced everywhere in this file: the live config file at
// env.XRAY_CONFIG is NEVER overwritten with content that has not already
// passed `xray run -test -config <candidate>` validation.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');
const env = require('../config/env');
const { atomicWriteFileSync } = require('../utils/atomicWrite');
const { withFileLock } = require('../utils/fileLock');
const xrayProcess = require('./xrayProcess.service');

const CONFIG_PATH = env.XRAY_CONFIG;
const BACKUPS_DIR = env.BACKUPS_DIR;
const TMP_DIR = path.join(BACKUPS_DIR, '.tmp');

fs.mkdirSync(BACKUPS_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function configExists() {
  return fs.existsSync(CONFIG_PATH);
}

function readConfigRaw() {
  if (!configExists()) {
    throw new Error(`Xray configuration not found at ${CONFIG_PATH}`);
  }
  return fs.readFileSync(CONFIG_PATH, 'utf8');
}

function readConfig() {
  return JSON.parse(readConfigRaw());
}

function tryParseJson(str) {
  try {
    return { valid: true, value: JSON.parse(str) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Runs `xray run -test -config <file>` against a candidate file WITHOUT
// touching the live configuration. Uses execFile (no shell interpolation).
function validateConfigFile(filePath) {
  return new Promise((resolve) => {
    execFile(
      env.XRAY_BINARY,
      ['run', '-test', '-config', filePath],
      { timeout: 15000 },
      (error, stdout, stderr) => {
        const output = `${stdout || ''}\n${stderr || ''}`.trim();
        if (error) {
          resolve({ valid: false, output: output || error.message });
        } else {
          resolve({ valid: true, output });
        }
      }
    );
  });
}

async function validateJsonString(jsonString) {
  const parsed = tryParseJson(jsonString);
  if (!parsed.valid) {
    return { valid: false, stage: 'json', output: parsed.error };
  }
  const tmpFile = path.join(TMP_DIR, `validate-${crypto.randomBytes(6).toString('hex')}.json`);
  try {
    fs.writeFileSync(tmpFile, jsonString, { mode: 0o600 });
    const result = await validateConfigFile(tmpFile);
    return { valid: result.valid, stage: 'xray', output: result.output };
  } finally {
    fs.rm(tmpFile, { force: true }, () => {});
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('config.json.backup-'))
    .map((f) => {
      const full = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(full);
      return {
        id: f,
        filename: f,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function backupFilePath(id) {
  const safe = path.basename(id);
  if (!safe.startsWith('config.json.backup-')) {
    throw new Error('Invalid backup id');
  }
  const full = path.join(BACKUPS_DIR, safe);
  if (!fs.existsSync(full)) throw new Error('Backup not found');
  return full;
}

function createBackup() {
  if (!configExists()) return null;
  const name = `config.json.backup-${timestamp()}`;
  const dest = path.join(BACKUPS_DIR, name);
  fs.copyFileSync(CONFIG_PATH, dest);
  return { id: name, filename: name, createdAt: new Date().toISOString() };
}

function readBackup(id) {
  const full = backupFilePath(id);
  return fs.readFileSync(full, 'utf8');
}

function deleteBackup(id) {
  const full = backupFilePath(id);
  fs.rmSync(full);
}

// The single safe entry point for writing a new Xray configuration.
// 1. Validate JSON syntax + `xray run -test` against a throwaway copy.
// 2. Only if valid: lock the live file, back it up, atomically replace it.
// 3. Unless { reload: false }, reload/restart the Xray systemd service so
//    the running process actually picks up new clients (a disk write alone
//    is NOT enough — this was why newly created UUIDs did not connect while
//    pre-existing ones already loaded in memory still worked).
// Returns { success, backup, output, reload } or throws on validation failure
// with the validator output attached (live config is left untouched).
async function writeConfigSafely(newConfigObject, options = {}) {
  const { reload = true } = options;
  const jsonString = JSON.stringify(newConfigObject, null, 2);
  const validation = await validateJsonString(jsonString);
  if (!validation.valid) {
    const err = new Error('Xray configuration failed validation; no changes were applied');
    err.validation = validation;
    throw err;
  }

  const writeResult = await withFileLock(CONFIG_PATH, async () => {
    const backup = createBackup();
    try {
      atomicWriteFileSync(CONFIG_PATH, jsonString, { mode: 0o644 });
      return { success: true, backup, output: validation.output };
    } catch (writeErr) {
      // Best-effort restore if the atomic write itself somehow failed.
      if (backup) {
        try {
          fs.copyFileSync(path.join(BACKUPS_DIR, backup.filename), CONFIG_PATH);
        } catch (_) {
          /* nothing more we can do */
        }
      }
      throw writeErr;
    }
  });

  if (!reload) return writeResult;

  // Config on disk is already correct at this point. A reload failure must
  // NOT roll back the file/DB — surface it so the admin can restart Xray.
  const reloadResult = await xrayProcess.reload();
  if (reloadResult.code !== 0) {
    const detail = (reloadResult.stderr || reloadResult.error || reloadResult.stdout || '').trim();
    console.error('[xray] config written but reload/restart failed:', detail || reloadResult);
    return {
      ...writeResult,
      reload: reloadResult,
      reloaded: false,
      reloadError: detail || 'Xray reload/restart failed — run: systemctl restart xray',
    };
  }
  return { ...writeResult, reload: reloadResult, reloaded: true };
}

// Restores a backup through the same safe validate -> backup -> replace
// pipeline used for regular writes.
async function restoreBackup(id) {
  const content = readBackup(id);
  const parsed = tryParseJson(content);
  if (!parsed.valid) {
    throw new Error(`Backup file is not valid JSON: ${parsed.error}`);
  }
  return writeConfigSafely(parsed.value);
}

const keyCache = new Map();

// Derive the Reality public key (pbk) from the private key in config.json.
// Uses Node's native X25519 first — this matches `xray x25519` and does not
// depend on CLI output format, which changed across Xray versions
// ("Public key:" vs "Password:" vs "Password (PublicKey):").
function deriveRealityPublicKeyLocal(privateKey) {
  if (!privateKey || typeof privateKey !== 'string') return null;
  let privBytes;
  try {
    privBytes = Buffer.from(privateKey, 'base64url');
    if (privBytes.length !== 32) privBytes = Buffer.from(privateKey, 'base64');
  } catch (_) {
    return null;
  }
  if (privBytes.length !== 32) return null;

  // Same clamp Xray applies before publishing the key.
  privBytes[0] &= 248;
  privBytes[31] &= 127;
  privBytes[31] |= 64;

  try {
    // PKCS#8 DER prefix for a raw 32-byte X25519 private key.
    const derPrefix = Buffer.from('302e020100300506032b656e04220420', 'hex');
    const keyObject = crypto.createPrivateKey({
      key: Buffer.concat([derPrefix, privBytes]),
      format: 'der',
      type: 'pkcs8',
    });
    const spki = crypto.createPublicKey(keyObject).export({ type: 'spki', format: 'der' });
    return spki.subarray(-32).toString('base64url');
  } catch (_) {
    return null;
  }
}

function parseXrayX25519PublicKey(stdout) {
  if (!stdout) return null;
  // Support old + new xray CLI formats.
  const patterns = [
    /Password\s*\(PublicKey\)\s*:\s*(\S+)/i,
    /Public\s*key\s*:\s*(\S+)/i,
    /Password\s*:\s*(\S+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(stdout);
    if (m) return m[1];
  }
  return null;
}

function getRealityPublicKey(privateKey) {
  if (!privateKey) return Promise.resolve(null);
  if (keyCache.has(privateKey)) return Promise.resolve(keyCache.get(privateKey));

  const local = deriveRealityPublicKeyLocal(privateKey);
  if (local) {
    keyCache.set(privateKey, local);
    return Promise.resolve(local);
  }

  // Fallback for unusual key encodings: ask the real xray binary.
  return new Promise((resolve) => {
    execFile(env.XRAY_BINARY, ['x25519', '-i', privateKey], { timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(null);
      const pub = parseXrayX25519PublicKey(stdout || '');
      if (pub) keyCache.set(privateKey, pub);
      resolve(pub);
    });
  });
}

// Writes the allowed Reality serverNames list into every Reality VLESS
// inbound. Does not change dest / privateKey / shortIds.
async function syncRealityServerNames(serverNames) {
  if (!Array.isArray(serverNames) || serverNames.length === 0) {
    throw new Error('serverNames must be a non-empty array');
  }
  if (!configExists()) {
    throw new Error(`Xray configuration not found at ${CONFIG_PATH}`);
  }
  const config = readConfig();
  let touched = 0;
  for (const ib of config.inbounds || []) {
    if (
      ib.protocol === 'vless' &&
      ib.streamSettings &&
      ib.streamSettings.security === 'reality' &&
      ib.streamSettings.realitySettings
    ) {
      ib.streamSettings.realitySettings.serverNames = [...serverNames];
      touched += 1;
    }
  }
  if (touched === 0) {
    throw new Error('No Reality VLESS inbound found to update serverNames');
  }
  return writeConfigSafely(config);
}

module.exports = {
  CONFIG_PATH,
  configExists,
  readConfigRaw,
  readConfig,
  validateJsonString,
  validateConfigFile,
  writeConfigSafely,
  listBackups,
  createBackup,
  readBackup,
  deleteBackup,
  restoreBackup,
  getRealityPublicKey,
  syncRealityServerNames,
};
