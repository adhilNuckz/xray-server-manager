const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../config/env');
const settings = require('./settings.service');

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // still run a comparison to avoid leaking length via early return timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function verifyCredentials(username, password) {
  const expectedUsername = settings.getEffectiveAdminUsername();
  if (!timingSafeStringEqual(username || '', expectedUsername)) return false;

  const storedHash = settings.getEffectiveAdminPasswordHash();
  if (storedHash) {
    return bcrypt.compare(password || '', storedHash);
  }
  return timingSafeStringEqual(password || '', env.ADMIN_PASSWORD);
}

async function changePassword(currentPassword, newPassword) {
  const username = settings.getEffectiveAdminUsername();
  const ok = await verifyCredentials(username, currentPassword);
  if (!ok) throw Object.assign(new Error('Current password is incorrect'), { status: 401 });
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('New password must be at least 8 characters'), { status: 400 });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  settings.setAdminPasswordHash(hash);
}

module.exports = { verifyCredentials, changePassword };
