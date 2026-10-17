const express = require('express');
const rateLimit = require('express-rate-limit');
const publicController = require('../controllers/public.controller');

const router = express.Router();

// Generous rate limit for public client status & ping
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(publicLimiter);

router.get('/usage/:id', publicController.getUsage);
router.get('/usage/:id/stream', publicController.streamUsage);
router.get('/ping', publicController.ping);
router.get('/speedtest/download', publicController.speedtestDownload);
router.post('/speedtest/upload', publicController.speedtestUpload);

module.exports = router;
