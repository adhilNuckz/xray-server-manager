const express = require('express');
const ctrl = require('../controllers/connections.controller');

const router = express.Router();

router.get('/', ctrl.list);
router.get('/active', ctrl.active);

module.exports = router;
