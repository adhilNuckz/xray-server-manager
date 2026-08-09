// Small, dependency-free input validation & sanitization helpers.
// Used everywhere user input touches the Xray config or the shell.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._-]{2,64}$/; // also allow simple identifiers
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_NAME_RE = /^[a-zA-Z0-9 _.,'@()\-]{1,64}$/;

function isValidUUID(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && EMAIL_RE.test(value);
}

function isValidDate(value) {
  if (!value) return true; // expiration is optional
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime());
}

function sanitizeName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 64);
}

function isSafeName(value) {
  return typeof value === 'string' && SAFE_NAME_RE.test(value);
}

function isValidFlow(value) {
  return ['xtls-rprx-vision', 'none', ''].includes(value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

module.exports = {
  isValidUUID,
  isValidEmail,
  isValidDate,
  sanitizeName,
  isSafeName,
  isValidFlow,
  isPlainObject,
};
