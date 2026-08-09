// Recursively masks known-sensitive keys (private keys, passwords, etc.)
// so the raw config viewer doesn't display secrets unless explicitly
// requested by the admin (with a warning) for editing purposes.
const SENSITIVE_KEYS = new Set(['privatekey', 'password', 'secretkey', 'psk', 'privkey']);

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase()) && typeof v === 'string' && v.length > 0) {
        out[k] = '••••••••(redacted)';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}

module.exports = { redactSecrets };
