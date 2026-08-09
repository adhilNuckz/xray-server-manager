const express = require('express');
const ctrl = require('../controllers/settings.controller');
const { requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.get('/', ctrl.getSettings);
router.put('/', requireCsrf, ctrl.updateSettings);
router.put('/username', requireCsrf, ctrl.updateUsername);

module.exports = router;
