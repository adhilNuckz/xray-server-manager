const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const SqliteSessionStore = require('./database/sqliteSessionStore');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const clientsService = require('./services/clients.service');
const trafficService = require('./services/traffic.service');
const connectionsService = require('./services/connections.service');
const monitorService = require('./services/monitor.service');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // the SPA is served same-origin; CSP can be tightened once asset hashes are finalized
  })
);

app.use(express.json({ limit: '2mb' }));

app.use(
  session({
    store: new SqliteSessionStore(),
    name: 'xray_panel_sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.use('/api', apiRoutes);

if (env.isProduction && fs.existsSync(env.FRONTEND_DIST)) {
  app.use(express.static(env.FRONTEND_DIST));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(env.FRONTEND_DIST, 'index.html'));
  });
} else {
  app.use('/api', notFoundHandler);
}

app.use(errorHandler);

async function bootstrap() {
  try {
    const { imported } = clientsService.importFromXrayConfig();
    if (imported > 0) {
      console.log(`[startup] Imported ${imported} existing client(s) from Xray configuration`);
    }
  } catch (err) {
    console.error('[startup] Failed to import existing Xray clients:', err.message);
    console.error('[startup] The panel will continue to run; fix the Xray config path/permissions and restart.');
  }

  // Push any active panel clients that are missing from config.json into the
  // live Xray config and reload Xray. Fixes the failure mode where the panel
  // DB had a new UUID (and generated a link) but Xray never loaded it.
  try {
    const sync = await clientsService.ensureClientsSynced();
    if (sync.wrote) {
      console.log('[startup] Synced panel clients into Xray config and reloaded Xray');
    }
  } catch (err) {
    console.error('[startup] Failed to sync clients into Xray config:', err.message);
  }

  connectionsService.start();
  trafficService.start();
  monitorService.start();

  app.listen(env.PANEL_PORT, '0.0.0.0', () => {
    console.log(`Xray Panel listening on http://0.0.0.0:${env.PANEL_PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Xray config: ${env.XRAY_CONFIG}`);
  });
}

bootstrap().catch((err) => {
  console.error('[startup] Fatal bootstrap error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
