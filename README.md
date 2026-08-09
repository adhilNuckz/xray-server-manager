# Xray VLESS Management Panel

A self-hosted web panel for managing an existing Xray (VLESS) server on the
**same machine** it runs on. It manages clients, generates VLESS share
links/QR codes, shows real traffic/system statistics, and safely
edits/validates/reloads the Xray configuration — without ever risking the
existing `config.json`.

Built with:

- **Backend:** Node.js + Express, SQLite (via `better-sqlite3`), plain
  `child_process`/`systemctl` integration — no unnecessary frameworks.
- **Frontend:** React + Vite + Tailwind CSS, dark-mode-only dashboard.
- **Process manager:** PM2.

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [Important limitations (read this)](#important-limitations-read-this)
3. [Fresh Ubuntu/Debian installation](#fresh-ubuntudebian-installation)
4. [Configuration (.env)](#configuration-env)
5. [Running with PM2](#running-with-pm2)
6. [AWS Security Group / UFW](#aws-security-group--ufw)
7. [Xray permissions & TLS/reality keys](#xray-permissions--tlsreality-keys)
8. [Enabling traffic stats & connection monitoring](#enabling-traffic-stats--connection-monitoring)
9. [Backups & safety model](#backups--safety-model)
10. [API reference](#api-reference)
11. [Local development](#local-development)
12. [Troubleshooting](#troubleshooting)
13. [Manual test checklist](#manual-test-checklist-performed)

---

## Architecture overview

```
xray-panel/
├── backend/                 Express API (auth, clients, xray, stats, backups...)
│   └── src/
│       ├── controllers/     Request handlers
│       ├── routes/          Express routers (all mounted under /api)
│       ├── services/        Business logic (xray config, systemd, stats...)
│       ├── middleware/      auth + CSRF
│       ├── utils/           validators, atomic writes, file locking, VLESS builder
│       ├── database/        SQLite schema + session store
│       └── server.js        Entry point (listens on 0.0.0.0:PANEL_PORT)
├── frontend/                React + Vite + Tailwind SPA
│   └── src/
│       ├── pages/           Dashboard, Clients, Traffic, Connections, Xray, Backups, Settings
│       ├── components/      Reusable UI (tables, modals, charts, sidebar...)
│       ├── context/         Auth, Toasts, Page title
│       └── services/api.js  Axios client (session cookies + CSRF header)
├── data/                    SQLite database + PM2 logs (gitignored)
├── backups/                 Timestamped Xray config backups (gitignored)
├── ecosystem.config.js      PM2 process definition
├── .env.example             Copy to .env and edit
└── dev-mock/                Mock `xray` CLI + sample config, LOCAL DEV ONLY
```

**The authoritative Xray configuration always remains
`/usr/local/etc/xray/config.json`.** The panel's SQLite database only stores
panel-level metadata (client names, notes, expiration dates, sessions,
traffic snapshots, audit logs, settings) — never a copy of the Xray config
itself. Every mutation to a client is applied by:

1. Reading the *metadata* clients should be active from SQLite.
2. Rebuilding the VLESS inbound's `clients` array from that metadata.
3. Writing it through the safe pipeline in `xrayConfig.service.js`:
   **validate JSON → validate with `xray run -test -config` → backup →
   atomic write (`rename()`) → done.**
4. Only a config that has already passed `xray run -test` can ever replace
   the live file. If validation fails, the live file is **never touched**.
5. A file lock (`proper-lockfile`) around the config path prevents two
   concurrent admin operations (e.g. two browser tabs) from corrupting the
   file.

If the panel is installed on a server that already has clients configured,
they are **automatically imported** into the panel's database on first
start (`clientsService.importFromXrayConfig()`), so nothing is lost.

If someone edits the raw config directly (via the "Xray Configuration" page
or by restoring a backup) and changes the `clients` array, the panel
re-syncs its database from the file afterwards (`reconcileFromConfig()`) so
the two never silently drift apart.

**Multiple VLESS inbounds are fully supported.** It's common for a real
deployment to expose more than one inbound sharing the same client UUIDs -
for example a primary TCP+Reality inbound on `443` plus a WS+TLS fallback
on another port for networks that block raw TCP. The panel detects *every*
inbound with `"protocol": "vless"` and a `clients` array, and:

- keeps each client's UUID/email identical across all of them,
- only writes the `flow` field (e.g. `xtls-rprx-vision`) onto inbounds whose
  transport is raw TCP, since XTLS flow is invalid over `ws`/`grpc`/`h2`,
- generates a separate share link + QR code per inbound (the "VLESS link"
  action shows a switcher when more than one applies), and
- counts established connections and applies enable/disable/expiry/backup
  logic across all of them together, never just the first one.

---

## Important limitations (read this)

The spec explicitly asked for honesty about what Xray-core can and cannot
reliably do. Please read this section before relying on these features:

### Per-client traffic accounting

Xray-core does **not** track per-UUID traffic unless you enable its
built-in **Stats API** (an `api` inbound + `stats`/`policy` blocks). The
panel does not invent numbers: until you click **"Enable Stats API"** on the
**Traffic** page, all per-client upload/download figures show `0 B` and are
clearly marked as unavailable. System-wide bandwidth (the dashboard charts)
is always real, measured directly from the network interface via
`systeminformation`, independent of the Stats API.

Enabling Stats API adds a **local-only** (`127.0.0.1`) dokodemo-door
inbound, `stats: {}`, and `policy` blocks to your config — through the same
validate/backup/atomic-write pipeline as any other change — then requires
restarting Xray to take effect. It never removes or modifies your existing
inbounds/outbounds.

### Connection monitoring

Xray-core's API does not expose a live "list of active connections". The
**only** place Xray associates a source IP with a client (email/UUID) is its
**access log**. The Connections page parses that log file (tailing new
lines as they're appended) to reconstruct recent activity. This is a
best-effort, log-based mechanism, not a guaranteed real-time connection
table. If access logging is disabled (the default), the panel tells you and
offers an **"Enable Access Log"** action on the Xray page.

### "One device per UUID" / max simultaneous connections

**Xray-core (open source) has no built-in per-client connection-count
limit.** A VLESS UUID is just a credential; it does not represent a
physical device, and Xray will happily accept multiple simultaneous
connections using the same UUID from different IPs.

What this panel actually does:

- Lets you configure a "maximum simultaneous connections per client"
  setting (1 / 2 / 3 / 5 / Unlimited).
- Uses the access-log-derived connection data to **detect** when a client
  has more distinct source IPs active than the configured maximum, within a
  short sliding window.
- Logs a `multi_device_suspected` entry to the audit log when this happens.

This is **detection and alerting, not enforcement**. True enforcement would
require either a different proxy core with native per-user connection caps,
a custom sidecar that watches raw socket counts per-user and kills
sockets/reloads Xray with that user removed, or an upstream feature that
does not currently exist in Xray-core. The architecture (a single settings
key + a monitoring service) is intentionally structured so a real
enforcement mechanism can be dropped in later without changing the API
surface.

### Expiration

Every 60 seconds, the panel checks all clients' expiration dates. As soon as
one passes, that client is automatically excluded from the live Xray
config's client list (so it can no longer connect) and the change is
recorded in the audit log. The `EXPIRED` clients still exist in the
database (for history/reporting) — they are simply no longer written into
`config.json`.

---

## Fresh Ubuntu/Debian installation

Run these on the same server where Xray is already installed (assumes
Xray is already installed and its systemd service is named `xray`).

### 1. Install Node.js (LTS) and npm

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

### 2. SQLite

No separate SQLite server is needed — `better-sqlite3` ships its own
embedded engine. You only need build tools for its native addon:

```bash
sudo apt-get install -y build-essential python3
```

### 3. Get the project onto the server

```bash
cd /opt
sudo git clone <your-repo-url> xray-panel   # or scp/rsync the folder
sudo chown -R $USER:$USER /opt/xray-panel
cd /opt/xray-panel
```

### 4. Install dependencies

```bash
cd backend && npm install --omit=dev && cd ..
cd frontend && npm install && cd ..
```

### 5. Configure environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```
PANEL_PORT=5252
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<choose a strong password>
XRAY_BINARY=/usr/local/bin/xray
XRAY_CONFIG=/usr/local/etc/xray/config.json
SERVER_ADDRESS=vpn.solitways.online   # domain (or public IP) used in VLESS links
SESSION_SECRET=<run: openssl rand -hex 32>
```

### 6. Build the frontend

```bash
cd frontend && npm run build && cd ..
```

This produces `frontend/dist`, which the backend serves directly on the
same port in production — **no separate frontend server or extra port is
needed.**

### 7. Verify Xray config access

Make sure the OS user that will run the panel (see step 8) can **read and
write** `/usr/local/etc/xray/config.json` and its parent directory, and can
**execute** `/usr/local/bin/xray`. Running the panel as `root` (typical for
a single-admin EC2 box that also owns the Xray systemd unit) is the
simplest option; if you prefer a dedicated user, add it to the appropriate
group and `chmod`/`chgrp` the config file and directory accordingly.

### 8. Install PM2 and start the panel

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

### 9. Configure PM2 to survive a server reboot

```bash
pm2 startup systemd
# pm2 will print a `sudo env PATH=... pm2 startup systemd -u <user> --hp <home>`
# command — copy/paste and run exactly that command once.
pm2 save
```

After this, a full server reboot will bring the panel back up automatically
(PM2's systemd unit starts PM2, which restores the saved process list).

### 10. Open the panel

```
http://<your-server-ip>:5252
```

Log in with the username/password from your `.env` and **change the
password immediately** from the Settings page.

---

## Configuration (.env)

| Variable | Description | Default |
|---|---|---|
| `PANEL_PORT` | Port the panel listens on (binds `0.0.0.0`) | `5252` |
| `ADMIN_USERNAME` | Hardcoded admin username (Phase 1, no user DB) | `admin` |
| `ADMIN_PASSWORD` | Hardcoded admin password | `ChangeThisPassword123!` |
| `XRAY_BINARY` | Absolute path to the `xray` binary | `/usr/local/bin/xray` |
| `XRAY_CONFIG` | Absolute path to Xray's `config.json` | `/usr/local/etc/xray/config.json` |
| `XRAY_SYSTEMD_SERVICE` | systemd unit name for Xray | `xray` |
| `SERVER_ADDRESS` | Public IP/hostname used in generated VLESS links | *(none)* |
| `SESSION_SECRET` | Random secret for signing session cookies | *(generate one)* |
| `DATA_DIR` | Where the SQLite DB lives | `./data` |
| `BACKUPS_DIR` | Where Xray config backups are stored | `./backups` |
| `NODE_ENV` | `production` on the server (serves the built frontend) | `development` |

The admin username/password can later be changed from the **Settings**
page — this stores a bcrypt hash of the new password in the local SQLite
database (overriding `.env`), without introducing a full user/auth
database system.

---

## Running with PM2

```bash
pm2 start ecosystem.config.js   # start
pm2 restart xray-panel          # restart after code changes
pm2 logs xray-panel             # tail logs
pm2 status                      # check it's online
pm2 save                        # persist the process list
```

The app is configured with `autorestart: true` and a memory cap
(`max_memory_restart: 300M`), so it restarts automatically if it crashes or
leaks memory. Verified during development: killing the process with `kill
-9` causes PM2 to relaunch it within ~1-2 seconds.

---

## AWS Security Group / UFW

The panel listens on **TCP 5252**. You must open this port for your browser
to reach it.

**AWS EC2 Security Group:**

- Type: Custom TCP
- Port range: `5252`
- Source: `0.0.0.0/0` for initial testing **only**.
  **For production, restrict the source to your own IP address /32**
  (e.g. `203.0.113.10/32`) — this panel has no additional network-level
  protection beyond the login page.

**UFW (if enabled on the instance):**

```bash
sudo ufw allow 5252/tcp
sudo ufw status
```

Do **not** modify SSH (port 22) rules as part of this setup.

---

## Xray permissions & TLS/reality keys

If your Xray systemd unit runs as `User=nobody` (common) and you use TLS
certificates from Let's Encrypt, `nobody` needs read access to the private
key without making it world-readable:

```bash
# Create a group that both nobody and certbot's renewal can use
sudo groupadd xray-cert
sudo usermod -aG xray-cert nobody

# Let the group read the live/archive directories
sudo chgrp -R xray-cert /etc/letsencrypt/live /etc/letsencrypt/archive
sudo chmod -R g+rx /etc/letsencrypt/live /etc/letsencrypt/archive

# Certbot overwrites permissions on renewal - add a deploy hook to reapply them
sudo tee /etc/letsencrypt/renewal-hooks/deploy/xray-perms.sh > /dev/null <<'EOF'
#!/bin/sh
chgrp -R xray-cert /etc/letsencrypt/live /etc/letsencrypt/archive
chmod -R g+rx /etc/letsencrypt/live /etc/letsencrypt/archive
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/xray-perms.sh
```

This panel is designed for a **VLESS + Reality** inbound (no certificate
files at all — Reality only needs the `privateKey`/`shortIds` already in
`config.json`), so most deployments following this guide will not need
certificate permission changes at all.

The panel itself never needs to read TLS private keys directly — it reads
`config.json` as a whole (which contains the Reality `privateKey`, not
certificate files), and redacts that value in the read-only config viewer.

---

## Enabling traffic stats & connection monitoring

These are opt-in, from the UI, because they modify the Xray configuration:

1. Go to **Traffic** → click **"Enable Stats API"**. This adds the
   `api`/`stats`/`policy` blocks and a local API inbound, validates,
   backs up, and writes the new config.
2. Go to **Xray** → **Restart** Xray to apply it.
3. Go to **Xray** → **"Enable Access Log"** if you also want the
   Connections page and per-client "last seen"/active-IP detection to work.
   Restart Xray again afterwards.
4. Make sure the log directory is writable by the user Xray runs as, e.g.:
   ```bash
   sudo mkdir -p /var/log/xray
   sudo chown nobody:nogroup /var/log/xray   # match your Xray User=
   ```

---

## Backups & safety model

- A backup (`config.json.backup-YYYYMMDD-HHMMSS`) is created **automatically
  before every write** to the live config — client changes, raw config
  edits, enabling stats/access-log, and restores all go through the same
  `writeConfigSafely()` function.
- Backups can also be created manually from the **Backups** or **Xray**
  page.
- **Validation always happens against a throwaway temp file before the live
  config is touched.** If `xray run -test -config <candidate>` fails, the
  live file is never modified and the error output is shown in the UI.
- Restoring a backup goes through the exact same validate → backup → atomic
  write pipeline (you're "writing" the backup's content as the new live
  config), so a corrupt backup can never be restored either.
- A cross-process file lock (`proper-lockfile`) around the config path
  serializes concurrent admin operations (e.g. two browser tabs saving at
  once) so the JSON file is never partially written or interleaved.

---

## API reference

All endpoints are under `/api` and (except `/api/auth/login`, `/logout`,
`/me`) require an authenticated session. State-changing requests
(POST/PUT/DELETE) also require an `X-CSRF-Token` header matching the token
issued at login (`/api/auth/login` and `/api/auth/me` return it).

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/change-password

GET    /api/clients
POST   /api/clients
GET    /api/clients/:id
PUT    /api/clients/:id
DELETE /api/clients/:id
POST   /api/clients/:id/enable
POST   /api/clients/:id/disable
GET    /api/clients/:id/vless      returns { links: [{ port, network, security, link }], status }

GET    /api/stats                 overview (server info + client counts + bandwidth)
GET    /api/stats/traffic         recent bandwidth history
GET    /api/stats/stream          Server-Sent Events live feed
POST   /api/stats/enable-stats-api

GET    /api/connections

GET    /api/xray/status
POST   /api/xray/start
POST   /api/xray/stop
POST   /api/xray/restart
POST   /api/xray/reload
POST   /api/xray/validate
GET    /api/xray/config           ?reveal=true to include secrets (for editing)
PUT    /api/xray/config
POST   /api/xray/enable-access-log

GET    /api/backups
POST   /api/backups
GET    /api/backups/:id
POST   /api/backups/:id/restore
DELETE /api/backups/:id

GET    /api/settings
PUT    /api/settings
PUT    /api/settings/username

GET    /api/audit
```

---

## Local development

The `dev-mock/` folder contains a fake `xray` CLI (`xray-mock.js`) and a
sample `config.json` so you can run and test the whole panel on a laptop
without a real Xray install or systemd service. Point `.env` at it:

```
XRAY_BINARY=/absolute/path/to/xray-panel/dev-mock/xray-mock.js
XRAY_CONFIG=/absolute/path/to/xray-panel/dev-mock/config.json
```

Then run backend and frontend separately (Vite proxies `/api` to the
backend):

```bash
cd backend && npm install && npm run dev     # http://localhost:5252 (API)
cd frontend && npm install && npm run dev    # http://localhost:5173 (UI, proxied)
```

`systemctl`-based Xray start/stop/restart calls will simply report
"inactive"/fail gracefully on a machine with no real `xray` systemd unit —
this does not crash the panel.

---

## Troubleshooting

**Panel won't start / "Xray configuration not found"**
Check `XRAY_CONFIG` in `.env` is an absolute path that exists and is
readable by the user running PM2/node.

**"xray run -test" always fails**
Check `XRAY_BINARY` points at the real executable and that the user running
the panel has execute permission on it.

**Clients page shows a client but it can't connect**
Check the client's status badge — `DISABLED` and `EXPIRED` clients are
intentionally excluded from the live config's client list.

**Traffic is always 0**
Enable the Stats API from the Traffic page, then restart Xray (see
[Enabling traffic stats](#enabling-traffic-stats--connection-monitoring)).

**Connections page is empty**
Enable the access log from the Xray page, then restart Xray, and make sure
the log file path is writable by the Xray process's user.

**Login rate-limited ("Too many login attempts")**
Wait 15 minutes, or restart the panel (in-memory limiter) — 10 attempts per
IP per 15-minute window.

**Changes to `.env` don't apply**
Restart PM2: `pm2 restart xray-panel`.

**Port 5252 not reachable from browser**
Check the AWS Security Group and (if enabled) UFW allow inbound TCP 5252,
and that the panel actually bound to `0.0.0.0` (see startup log —
`pm2 logs xray-panel`).

---

## Manual test checklist (performed)

The following flows were exercised end-to-end against the mock Xray
environment in `dev-mock/` during development, and are expected to behave
identically against a real Xray install:

- [x] Login with correct/incorrect credentials, session cookie issued
- [x] Logout clears the session
- [x] CSRF token required and enforced on all state-changing requests
- [x] Login rate limiting (10 attempts / 15 min → HTTP 429)
- [x] Existing Xray clients auto-imported into the panel on first start
- [x] Client creation generates a UUID and writes it into `config.json`
- [x] Client edit, enable, disable, delete all round-trip through the safe
      config pipeline and roll back the DB change if config validation fails
- [x] VLESS link generated purely from `config.json` fields (port, reality
      settings, flow, etc.) plus the configured server address
- [x] QR code renders for the generated link
- [x] `xray run -test` validation runs before every config write
- [x] Config backup created automatically before every write
- [x] Backup restore re-validates and reconciles the DB with the restored
      file's actual client list
- [x] Raw config editor: redacted by default, requires explicit "reveal" to
      edit, validates before saving
- [x] Dashboard statistics (CPU/RAM/disk/uptime/hostname) reflect real
      `systeminformation` data
- [x] Live bandwidth chart updates via Server-Sent Events without a page
      refresh
- [x] Password change updates a bcrypt hash in SQLite and old password stops
      working immediately
- [x] Audit log records login, logout, client CRUD, config changes, backup
      restore, password change
- [x] PM2 start/stop/restart, `pm2 save`, and automatic restart after
      `kill -9` all verified
- [x] `pm2 startup systemd` produces a valid boot-persistence command

---

## Security summary

- Hardcoded credentials in `.env`, changeable via Settings (bcrypt hash
  stored locally, not a full auth/user database).
- `express-session` with `httpOnly`, `SameSite=Lax` cookies, backed by a
  SQLite-persisted store (survives PM2/server restarts).
- Double-submit CSRF token required on all mutating requests.
- `express-rate-limit` on the login endpoint.
- All shell interaction uses `execFile` with fixed argument arrays — **no
  string concatenation into a shell command anywhere** — so user input can
  never be interpreted as shell syntax.
- All filesystem operations are restricted to the configured Xray config
  path and the panel's own `backups`/`data` directories; there is no
  generic file-browsing or arbitrary-path API.
- No web terminal, no arbitrary command execution endpoint.
- UUIDs, emails, dates, and client names are validated/sanitized before
  ever being written to the Xray config or the database.
- Private keys/passwords are redacted in the raw config viewer by default.
