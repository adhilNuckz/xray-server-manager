#!/usr/bin/env bash
# ==============================================================================
# Xray VLESS Management Panel - All-in-One Automated Installer
# Supports: Ubuntu 20.04+, Ubuntu 22.04+, Ubuntu 24.04+, Debian 11+
# ==============================================================================
set -Eeuo pipefail

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ------------------------------------------------------------------------------
# 1. Root check
# ------------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root. Please use: sudo bash $0"
    exit 1
fi

echo -e "${BLUE}${BOLD}"
echo "======================================================"
echo "      Xray VLESS Reality & Management Panel Setup     "
echo "======================================================"
echo -e "${NC}"

# Helper to read from /dev/tty if stdin is piped (e.g. curl | bash)
read_prompt() {
    local prompt="$1"
    local default_val="$2"
    local is_secret="${3:-false}"
    local input=""

    if [ -t 0 ]; then
        if [ "$is_secret" = "true" ]; then
            read -rsp "$prompt" input
            echo
        else
            read -rp "$prompt" input
        fi
    elif [ -e /dev/tty ]; then
        if [ "$is_secret" = "true" ]; then
            read -rsp "$prompt" input </dev/tty
            echo
        else
            read -rp "$prompt" input </dev/tty
        fi
    fi

    if [ -z "$input" ]; then
        echo "$default_val"
    else
        echo "$input"
    fi
}

# ------------------------------------------------------------------------------
# 2. Gather User Inputs
# ------------------------------------------------------------------------------
# Subdomain
SUBDOMAIN="${SUBDOMAIN:-}"
while [ -z "$SUBDOMAIN" ]; do
    echo -en "${YELLOW}Enter your pointed domain/subdomain (e.g. xray.example.com): ${NC}"
    SUBDOMAIN=$(read_prompt "" "")
    if [ -z "$SUBDOMAIN" ]; then
        log_warn "Domain cannot be empty. Please enter a valid pointed domain."
    fi
done

# Admin Username
DEFAULT_USER="admin"
ADMIN_USERNAME="${ADMIN_USERNAME:-}"
if [ -z "$ADMIN_USERNAME" ]; then
    echo -en "${YELLOW}Enter Admin Username [default: ${DEFAULT_USER}]: ${NC}"
    ADMIN_USERNAME=$(read_prompt "" "$DEFAULT_USER")
fi

# Admin Password
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
if [ -z "$ADMIN_PASSWORD" ]; then
    RANDOM_PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9!@#%^&*()' | head -c 16 || echo "AdminPass123!")
    echo -en "${YELLOW}Enter Admin Password [press Enter to auto-generate]: ${NC}"
    ADMIN_PASSWORD=$(read_prompt "" "$RANDOM_PASS")
fi

# Panel Internal Port
DEFAULT_PORT="5252"
PANEL_PORT="${PANEL_PORT:-}"
if [ -z "$PANEL_PORT" ]; then
    echo -en "${YELLOW}Enter Panel Port [default: ${DEFAULT_PORT}]: ${NC}"
    PANEL_PORT=$(read_prompt "" "$DEFAULT_PORT")
fi

# Certbot Email
DEFAULT_EMAIL="admin@${SUBDOMAIN}"
CERT_EMAIL="${CERT_EMAIL:-$DEFAULT_EMAIL}"

echo ""
echo -e "${CYAN}Configuration Summary:${NC}"
echo -e "  Domain:    ${GREEN}${SUBDOMAIN}${NC}"
echo -e "  Username:  ${GREEN}${ADMIN_USERNAME}${NC}"
echo -e "  Password:  ${GREEN}${ADMIN_PASSWORD}${NC}"
echo -e "  Port:      ${GREEN}${PANEL_PORT}${NC}"
echo -e "  Email:     ${GREEN}${CERT_EMAIL}${NC}"
echo ""

# ------------------------------------------------------------------------------
# 3. System Packages & Prerequisites
# ------------------------------------------------------------------------------
log_info "Updating system packages and installing prerequisites..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    curl \
    wget \
    git \
    socat \
    jq \
    build-essential \
    python3 \
    tar \
    unzip \
    ufw \
    iptables \
    nginx \
    libnginx-mod-stream \
    certbot \
    python3-certbot-nginx

# Install Node.js LTS (v20) if not present or < v18
NODE_VER=0
if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1 || echo "0")
fi

if [ "$NODE_VER" -lt 18 ]; then
    log_info "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install PM2 if missing
if ! command -v pm2 >/dev/null 2>&1; then
    log_info "Installing PM2 globally..."
    npm install -g pm2
fi

# ------------------------------------------------------------------------------
# 4. Firewall Configuration (UFW & Iptables)
# ------------------------------------------------------------------------------
log_info "Configuring firewall..."
# UFW rules
if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
    ufw allow 8443:8450/tcp >/dev/null 2>&1 || true
    ufw reload >/dev/null 2>&1 || true
fi

# Oracle Cloud / standard iptables rules
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 2 -p tcp --dport 443 -j ACCEPT
iptables -C INPUT -p tcp --dport "$PANEL_PORT" -j ACCEPT 2>/dev/null || iptables -I INPUT 3 -p tcp --dport "$PANEL_PORT" -j ACCEPT
iptables -C INPUT -p tcp -m multiport --dports 8443:8450 -j ACCEPT 2>/dev/null || iptables -I INPUT 4 -p tcp -m multiport --dports 8443:8450 -j ACCEPT

if [ -f /etc/iptables/rules.v4 ]; then
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

# ------------------------------------------------------------------------------
# 5. Acquire SSL Certificate
# ------------------------------------------------------------------------------
log_info "Acquiring Let's Encrypt SSL certificate for ${SUBDOMAIN}..."
systemctl stop nginx 2>/dev/null || true

certbot certonly --standalone \
    -d "$SUBDOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$CERT_EMAIL" \
    --keep-until-expiring

CERT_PATH="/etc/letsencrypt/live/${SUBDOMAIN}/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/${SUBDOMAIN}/privkey.pem"

if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
    log_error "Failed to obtain SSL certificate for ${SUBDOMAIN}. Please verify DNS points to this server IP."
    exit 1
fi
log_success "SSL certificate obtained successfully."

# ------------------------------------------------------------------------------
# 6. Configure Nginx with Stream Preread SNI Multiplexing
# ------------------------------------------------------------------------------
log_info "Configuring Nginx with SNI multiplexing..."
cat > /etc/nginx/stream.conf << EOF
stream {
    map \$ssl_preread_server_name \$backend_name {
        ${SUBDOMAIN}  web_backend;
        default        xray_backend;
    }

    upstream web_backend {
        server 127.0.0.1:8443;
    }

    upstream xray_backend {
        server 127.0.0.1:10443;
    }

    server {
        listen 443;
        listen [::]:443;
        proxy_pass \$backend_name;
        ssl_preread on;
        proxy_connect_timeout 5s;
        proxy_timeout 1h;
    }
}
EOF

grep -q "include /etc/nginx/stream.conf;" /etc/nginx/nginx.conf || echo "include /etc/nginx/stream.conf;" >> /etc/nginx/nginx.conf

cat > "/etc/nginx/sites-available/${SUBDOMAIN}" << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SUBDOMAIN};
    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 127.0.0.1:8443 ssl http2;
    server_name ${SUBDOMAIN};
    client_max_body_size 50m;

    ssl_certificate ${CERT_PATH};
    ssl_certificate_key ${KEY_PATH};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf "/etc/nginx/sites-available/${SUBDOMAIN}" "/etc/nginx/sites-enabled/${SUBDOMAIN}"

nginx -t
systemctl restart nginx
systemctl enable nginx
log_success "Nginx configured and running."

# ------------------------------------------------------------------------------
# 7. Install and Configure Xray-Core
# ------------------------------------------------------------------------------
log_info "Installing Xray-core..."
if ! command -v xray >/dev/null 2>&1; then
    bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
fi

mkdir -p /etc/systemd/system/xray.service.d
cat > /etc/systemd/system/xray.service.d/10-donot_touch_single_conf.conf << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
EOF
systemctl daemon-reload

# Check existing Reality keys or generate fresh ones
REALITY_PRIV_KEY=""
REALITY_SHORT_ID=""
if [ -f /usr/local/etc/xray/config.json ]; then
    REALITY_PRIV_KEY=$(jq -r '.inbounds[]? | select(.protocol=="vless" and .streamSettings.security=="reality") | .streamSettings.realitySettings.privateKey' /usr/local/etc/xray/config.json 2>/dev/null | head -n1 || true)
    REALITY_SHORT_ID=$(jq -r '.inbounds[]? | select(.protocol=="vless" and .streamSettings.security=="reality") | .streamSettings.realitySettings.shortIds[0]' /usr/local/etc/xray/config.json 2>/dev/null | head -n1 || true)
fi

if [ -z "$REALITY_PRIV_KEY" ] || [ "$REALITY_PRIV_KEY" = "null" ]; then
    log_info "Generating new Reality keypair via xray x25519..."
    KEYPAIR=$(xray x25519)
    REALITY_PRIV_KEY=$(echo "$KEYPAIR" | grep -i "Private key:" | awk '{print $3}')
    REALITY_SHORT_ID=$(openssl rand -hex 8)
fi

# Ensure initial client UUID exists
INITIAL_CLIENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16)

mkdir -p /usr/local/etc/xray
mkdir -p /var/log/xray
chown -R xray:xray /var/log/xray 2>/dev/null || true
chmod 755 /var/log/xray 2>/dev/null || true

# Setup logrotate for Xray logs to prevent disk growth
cat > /etc/logrotate.d/xray << 'EOF'
/var/log/xray/*.log {
    daily
    rotate 7
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
}
EOF

cat > /usr/local/etc/xray/config.json << EOF
{
  "log": {
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log",
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 10443,
      "protocol": "vless",
      "tag": "vless-reality-support-zoom-us",
      "settings": {
        "clients": [
          {
            "id": "${INITIAL_CLIENT_ID}",
            "email": "default@xray.user",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "support.zoom.us:443",
          "xver": 0,
          "serverNames": [
            "support.zoom.us"
          ],
          "privateKey": "${REALITY_PRIV_KEY}",
          "shortIds": [
            "${REALITY_SHORT_ID}"
          ]
        }
      }
    },
    {
      "listen": "0.0.0.0",
      "port": 8445,
      "protocol": "vless",
      "tag": "vless-reality-youtubeair",
      "settings": {
        "clients": [
          {
            "id": "${INITIAL_CLIENT_ID}",
            "email": "default@xray.user",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "m.youtube.com:443",
          "xver": 0,
          "serverNames": [
            "m.youtube.com"
          ],
          "privateKey": "${REALITY_PRIV_KEY}",
          "shortIds": [
            "${REALITY_SHORT_ID}"
          ]
        }
      }
    },
    {
      "listen": "0.0.0.0",
      "port": 8446,
      "protocol": "vless",
      "tag": "vless-reality-fb",
      "settings": {
        "clients": [
          {
            "id": "${INITIAL_CLIENT_ID}",
            "email": "default@xray.user",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "m.facebook.com:443",
          "xver": 0,
          "serverNames": [
            "m.facebook.com"
          ],
          "privateKey": "${REALITY_PRIV_KEY}",
          "shortIds": [
            "${REALITY_SHORT_ID}"
          ]
        }
      }
    },
    {
      "listen": "0.0.0.0",
      "port": 8447,
      "protocol": "vless",
      "tag": "vless-reality-fb-2cb8",
      "settings": {
        "clients": [
          {
            "id": "${INITIAL_CLIENT_ID}",
            "email": "default@xray.user",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "web.facebook.com:443",
          "xver": 0,
          "serverNames": [
            "web.facebook.com"
          ],
          "privateKey": "${REALITY_PRIV_KEY}",
          "shortIds": [
            "${REALITY_SHORT_ID}"
          ]
        }
      }
    },
    {
      "listen": "0.0.0.0",
      "port": 8448,
      "protocol": "vless",
      "tag": "vless-reality-airtelpack",
      "settings": {
        "clients": [
          {
            "id": "${INITIAL_CLIENT_ID}",
            "email": "default@xray.user",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "whatsapp.net:443",
          "xver": 0,
          "serverNames": [
            "whatsapp.net"
          ],
          "privateKey": "${REALITY_PRIV_KEY}",
          "shortIds": [
            "${REALITY_SHORT_ID}"
          ]
        }
      }
    },
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "settings": {
        "address": "127.0.0.1"
      },
      "tag": "api"
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom"
    }
  ],
  "api": {
    "tag": "api",
    "services": [
      "StatsService"
    ]
  },
  "stats": {},
  "policy": {
    "levels": {
      "0": {
        "statsUserUplink": true,
        "statsUserDownlink": true
      }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true,
      "statsOutboundUplink": true,
      "statsOutboundDownlink": true
    }
  },
  "routing": {
    "rules": [
      {
        "type": "field",
        "inboundTag": [
          "api"
        ],
        "outboundTag": "api"
      }
    ]
  }
}
EOF

chmod 664 /usr/local/etc/xray/config.json
chown root:xray /usr/local/etc/xray/config.json 2>/dev/null || true
/usr/local/bin/xray run -test -config /usr/local/etc/xray/config.json
systemctl restart xray
systemctl enable xray
log_success "Xray-core configured and running."

# ------------------------------------------------------------------------------
# 8. Deploy Xray Management Panel
# ------------------------------------------------------------------------------
log_info "Deploying Xray Management Panel..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/backend/src/server.js" ]; then
    APP_DIR="$SCRIPT_DIR"
else
    APP_DIR="/opt/xray-panel"
    if [ -d "$APP_DIR/.git" ]; then
        log_info "Updating repository at ${APP_DIR}..."
        cd "$APP_DIR" && git pull
    else
        log_info "Cloning repository into ${APP_DIR}..."
        mkdir -p "$APP_DIR"
        git clone https://github.com/adhilNuckz/xray-server-manager.git "$APP_DIR"
    fi
fi

# Build backend
log_info "Installing backend dependencies..."
cd "${APP_DIR}/backend"
npm install --omit=dev

# Build frontend
log_info "Building frontend..."
cd "${APP_DIR}/frontend"
npm install
npm run build

# Configure .env
log_info "Writing panel configuration (.env)..."
SESSION_SECRET=$(openssl rand -hex 32)
cat > "${APP_DIR}/.env" << EOF
PANEL_PORT=${PANEL_PORT}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
XRAY_BINARY=/usr/local/bin/xray
XRAY_CONFIG=/usr/local/etc/xray/config.json
XRAY_SYSTEMD_SERVICE=xray
SERVER_ADDRESS=${SUBDOMAIN}
SESSION_SECRET=${SESSION_SECRET}
DATA_DIR=./data
BACKUPS_DIR=./backups
NODE_ENV=production
EOF

mkdir -p "${APP_DIR}/data" "${APP_DIR}/backups"

# Initialize SQLite settings
cd "${APP_DIR}"
node -e '
const db = require("./backend/node_modules/better-sqlite3")("./data/panel.db");
// Ensure schema tables exist if starting fresh
const fs = require("fs");
if (fs.existsSync("./backend/src/database/schema.sql")) {
  const schema = fs.readFileSync("./backend/src/database/schema.sql", "utf8");
  db.exec(schema);
}
const set = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
set.run("server_address", process.env.SUBDOMAIN);
set.run("reality_server_names", JSON.stringify(["support.zoom.us","m.youtube.com","m.facebook.com","web.facebook.com","whatsapp.net"]));
set.run("reality_inbounds", JSON.stringify([
  {"id":"support-zoom-us","label":"Support Zoom Us","port":443,"dest":"support.zoom.us:443","serverNames":["support.zoom.us"]},
  {"id":"youtubeair","label":"Youtubeair","port":8445,"dest":"m.youtube.com:443","serverNames":["m.youtube.com"]},
  {"id":"fb","label":"Fb","port":8446,"dest":"m.facebook.com:443","serverNames":["m.facebook.com"]},
  {"id":"fb-2cb8","label":"Fb 2cb8","port":8447,"dest":"web.facebook.com:443","serverNames":["web.facebook.com"]},
  {"id":"airtelpack","label":"Airtelpack","port":8448,"dest":"whatsapp.net:443","serverNames":["whatsapp.net"]}
]));
' SUBDOMAIN="${SUBDOMAIN}" 2>/dev/null || true

# Start with PM2
log_info "Starting panel with PM2..."
pm2 delete xray-panel 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root --force >/dev/null 2>&1 || true
pm2 save

log_success "Xray Management Panel started."

# ------------------------------------------------------------------------------
# 9. Installation Complete Summary
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}======================================================${NC}"
echo -e "${GREEN}${BOLD}          INSTALLATION COMPLETED SUCCESSFULLY!        ${NC}"
echo -e "${GREEN}${BOLD}======================================================${NC}"
echo ""
echo -e "  ${BOLD}Panel Dashboard URL:${NC}  ${CYAN}https://${SUBDOMAIN}/${NC}"
echo -e "  ${BOLD}Direct Local Port:${NC}    http://127.0.0.1:${PANEL_PORT}"
echo -e "  ${BOLD}Admin Username:${NC}       ${CYAN}${ADMIN_USERNAME}${NC}"
echo -e "  ${BOLD}Admin Password:${NC}       ${CYAN}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  ${BOLD}Reality Inbounds:${NC}"
echo -e "    - Port 443  (Zoom / SNI support.zoom.us)"
echo -e "    - Port 8445 (YouTube / SNI m.youtube.com)"
echo -e "    - Port 8446 (Facebook / SNI m.facebook.com)"
echo -e "    - Port 8447 (Facebook Web / SNI web.facebook.com)"
echo -e "    - Port 8448 (WhatsApp / SNI whatsapp.net)"
echo ""
echo -e "  ${YELLOW}Useful commands:${NC}"
echo -e "    pm2 logs xray-panel       # View panel logs"
echo -e "    pm2 restart xray-panel    # Restart panel"
echo -e "    systemctl status xray     # Check Xray service"
echo -e "    systemctl status nginx    # Check Nginx service"
echo -e "${GREEN}======================================================${NC}"
echo ""
