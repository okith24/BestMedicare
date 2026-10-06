#!/usr/bin/env bash
# First-time setup for Best Medicare on an Ubuntu 24.04 VPS.
#
# Run this ON THE VPS as root (or with sudo), after:
#   1. DNS: A records for bestmedicarenawala.com and www.bestmedicarenawala.com
#      point to this server's IP.
#   2. MongoDB Atlas: this server's IP is on the IP Access List.
#   3. backend/.env has been created in the app folder (see the message at step 6).
#
# Usage:
#   sudo bash setup-vps.sh you@example.com
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo bash setup-vps.sh you@example.com)" >&2
  exit 1
fi

LETSENCRYPT_EMAIL="${1:-}"
if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Usage: sudo bash setup-vps.sh <email-for-certificate-notices>" >&2
  exit 1
fi

REPO_URL="https://github.com/okith24/BestMedicare.git"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_ROOT="/opt/medicare"
# The app lives in a nested folder inside the repo.
APP_DIR="$APP_ROOT/medicre (2) (1)/medicre"
DOMAIN="bestmedicarenawala.com"
WEB_ROOT="/var/www/html"

echo "==> 1/8 Updating system packages"
apt-get update -y
apt-get upgrade -y

echo "==> 2/8 Installing nginx, git, certbot, firewall"
apt-get install -y nginx git certbot ufw rsync curl ca-certificates

echo "==> 3/8 Installing Node.js 20 and pm2"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> 4/8 Firewall: allow SSH, HTTP, HTTPS"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> 5/8 Fetching the code and building the frontend"
if [[ -d "$APP_ROOT/.git" ]]; then
  git -C "$APP_ROOT" fetch origin
  git -C "$APP_ROOT" checkout "$REPO_BRANCH"
  git -C "$APP_ROOT" pull --ff-only origin "$REPO_BRANCH"
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_ROOT"
fi

cd "$APP_DIR"
npm ci
npm run build
mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"

echo "==> 6/8 Backend dependencies and environment"
cd "$APP_DIR/backend"
npm ci --omit=dev
if [[ ! -f .env ]]; then
  cat >&2 <<EOF

backend/.env is missing. Create it before the API will start:

  nano "$APP_DIR/backend/.env"

It must contain at least: PORT=5000, MONGO_URI=..., COOKIE_SECRET=..., FRONTEND_ORIGIN=https://$DOMAIN,
plus your SMS_* settings. Then run this script again.
EOF
  exit 1
fi

echo "==> 7/8 Starting the API with pm2 (restarts on reboot)"
pm2 delete medicare-api >/dev/null 2>&1 || true
pm2 start server.js --name medicare-api --cwd "$APP_DIR/backend"
pm2 save
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root >/dev/null

echo "==> 8/8 HTTPS certificate and nginx"
systemctl stop nginx || true
certbot certonly --standalone --non-interactive --agree-tos \
  -m "$LETSENCRYPT_EMAIL" \
  -d "$DOMAIN" -d "www.$DOMAIN"

cp "$APP_ROOT/nginx-default-clean.conf" /etc/nginx/sites-available/medicare
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/medicare /etc/nginx/sites-enabled/medicare
nginx -t
systemctl enable nginx
systemctl start nginx
systemctl reload nginx

echo
echo "Done. Check:"
echo "  https://$DOMAIN"
echo "  https://$DOMAIN/api/health   (should show database: connected)"
echo "  pm2 status"
