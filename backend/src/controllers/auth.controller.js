const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const settings = require('../services/settings.service');
const audit = require('../services/audit.service');

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const ok = await authService.verifyCredentials(username, password);
  if (!ok) {
    audit.log(username, 'login_failed', null, req.ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Failed to create session' });
    req.session.user = { username: settings.getEffectiveAdminUsername() };
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    audit.log(username, 'login', null, req.ip);
    res.json({ username: req.session.user.username, csrfToken: req.session.csrfToken });
  });
});

const logout = asyncHandler(async (req, res) => {
  const username = req.session && req.session.user && req.session.user.username;
  req.session.destroy(() => {
    res.clearCookie('xray_panel_sid');
    audit.log(username, 'logout', null, req.ip);
    res.json({ success: true });
  });
});

const me = asyncHandler(async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ username: req.session.user.username, csrfToken: req.session.csrfToken });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await authService.changePassword(currentPassword, newPassword);
  audit.log(req.session.user.username, 'password_changed', null, req.ip);
  res.json({ success: true });
});

module.exports = { login, logout, me, changePassword };
