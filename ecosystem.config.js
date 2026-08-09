// PM2 process definition for the Xray VLESS management panel.
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   (then run the printed command once, as root)
module.exports = {
  apps: [
    {
      name: 'xray-panel',
      cwd: __dirname,
      script: 'backend/src/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      // Load additional variables from .env at the project root via dotenv
      // inside backend/src/config/env.js - no need to duplicate them here.
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '300M',
      out_file: './data/logs/pm2-out.log',
      error_file: './data/logs/pm2-error.log',
      time: true,
    },
  ],
};
