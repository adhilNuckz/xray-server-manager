const express = require('express');
const ctrl = require('../controllers/connections.controller');

const router = express.Router();

router.get('/', ctrl.list);

module.exports = router;
