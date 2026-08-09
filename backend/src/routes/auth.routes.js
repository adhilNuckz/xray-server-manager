const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/auth.controller');
const { requireAuth, requireCsrf } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

router.post('/login', loginLimiter, ctrl.login);
router.post('/logout', requireAuth, requireCsrf, ctrl.logout);
router.get('/me', ctrl.me);
router.post('/change-password', requireAuth, requireCsrf, ctrl.changePassword);

module.exports = router;
