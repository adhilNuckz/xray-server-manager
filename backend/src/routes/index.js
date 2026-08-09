const express = require('express');
const { requireAuth, requireCsrf } = require('../middleware/auth');

const authRoutes = require('./auth.routes');
const clientsRoutes = require('./clients.routes');
const statsRoutes = require('./stats.routes');
const connectionsRoutes = require('./connections.routes');
const xrayRoutes = require('./xray.routes');
const backupsRoutes = require('./backups.routes');
const settingsRoutes = require('./settings.routes');
const auditRoutes = require('./audit.routes');

const router = express.Router();

// Public (login/logout/me handle their own auth requirements internally).
router.use('/auth', authRoutes);

// Everything below requires an authenticated session.
router.use('/clients', requireAuth, clientsRoutes);
router.use('/stats', requireAuth, statsRoutes);
router.use('/connections', requireAuth, connectionsRoutes);
router.use('/xray', requireAuth, xrayRoutes);
router.use('/backups', requireAuth, backupsRoutes);
router.use('/settings', requireAuth, settingsRoutes);
router.use('/audit', requireAuth, auditRoutes);

module.exports = router;
