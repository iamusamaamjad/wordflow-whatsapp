#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  WhatsApp Gateway — One-Command Setup
#  Usage:  bash setup.sh
#  Env vars (optional):
#    WA_PORT=3095        — port to run on
#    WA_DATA_DIR=/path   — where WhatsApp session is stored
#    WA_PM2_NAME=name    — PM2 process name
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────
WA_PORT="${WA_PORT:-3095}"
WA_DATA_DIR="${WA_DATA_DIR:-$HOME/wacli-data}"
WA_PM2_NAME="${WA_PM2_NAME:-whatsapp-gateway}"
WACLI_REPO="https://github.com/openclaw/wacli.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_DIR="$SCRIPT_DIR/gateway"

# ── Colors ────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1;34m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $1"; }
info() { echo -e "${B}[→]${N} $1"; }
warn() { echo -e "${Y}[!]${N} $1"; }
err()  { echo -e "${R}[✗]${N} $1"; exit 1; }

echo -e "${B}"
echo "╔══════════════════════════════════════════════╗"
echo "║      WhatsApp Gateway — Setup Script         ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${N}"

OS="$(uname -s)"
ARCH="$(uname -m)"
info "OS: $OS | Arch: $ARCH"

# ── 1. Docker ─────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  log "Docker: $(docker --version | head -1)"
else
  if [ "$OS" = "Darwin" ]; then
    err "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
  fi
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  log "Docker installed"
fi

# ── 2. Node.js ────────────────────────────────────────────────────
if command -v node &>/dev/null; then
  log "Node.js: $(node --version)"
else
  info "Installing Node.js v22..."
  if [ "$OS" = "Darwin" ]; then
    command -v brew &>/dev/null || err "Homebrew not found. Install from https://brew.sh then re-run."
    brew install node@22
    brew link node@22 --force --overwrite 2>/dev/null || true
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  log "Node.js installed: $(node --version)"
fi

# ── 3. PM2 ────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  log "PM2: $(pm2 --version)"
else
  info "Installing PM2..."
  npm install -g pm2
  log "PM2 installed"
fi

# ── 4. Build wacli Docker image ───────────────────────────────────
if docker image inspect wacli &>/dev/null 2>&1; then
  log "wacli Docker image: already built"
else
  info "Building wacli Docker image (2–5 min first time)..."
  TMP_WACLI=$(mktemp -d)
  trap 'rm -rf "$TMP_WACLI"' EXIT
  git clone --depth=1 "$WACLI_REPO" "$TMP_WACLI/wacli"
  docker build -t wacli "$TMP_WACLI/wacli"
  log "wacli image built"
fi

# ── 5. Install Node dependencies ──────────────────────────────────
info "Installing gateway dependencies..."
cd "$GATEWAY_DIR"
npm install --production --silent
log "Dependencies installed"

# ── 6. Data directory ─────────────────────────────────────────────
mkdir -p "$WA_DATA_DIR"
log "Data directory: $WA_DATA_DIR"

# ── 7. Write ecosystem config ─────────────────────────────────────
cat > "$SCRIPT_DIR/ecosystem.config.js" <<ECOEOF
module.exports = {
  apps: [{
    name: '$WA_PM2_NAME',
    script: '$GATEWAY_DIR/server.js',
    restart_delay: 3000,
    max_restarts: 10,
    env: {
      WA_PORT:     '$WA_PORT',
      WA_DATA_DIR: '$WA_DATA_DIR',
      WA_IMAGE:    'wacli'
    }
  }]
};
ECOEOF
log "PM2 ecosystem config written"

# ── 8. Start / restart with PM2 ───────────────────────────────────
if pm2 list | grep -q "$WA_PM2_NAME"; then
  info "Restarting existing PM2 process..."
  pm2 restart "$WA_PM2_NAME"
else
  info "Starting gateway with PM2..."
  pm2 start "$SCRIPT_DIR/ecosystem.config.js"
fi

pm2 save

# ── 9. Auto-start on reboot (Linux only) ──────────────────────────
if [ "$OS" != "Darwin" ]; then
  pm2 startup 2>/dev/null | grep "sudo" | bash 2>/dev/null || true
  pm2 save
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo -e "${G}╔══════════════════════════════════════════════╗${N}"
echo -e "${G}║          Setup Complete!                     ║${N}"
echo -e "${G}╚══════════════════════════════════════════════╝${N}"
echo ""
echo -e "  UI:     ${B}http://localhost:${WA_PORT}${N}"
echo -e "  Status: ${B}curl http://localhost:${WA_PORT}/api/status${N}"
echo -e "  Logs:   ${B}pm2 logs ${WA_PM2_NAME}${N}"
echo ""
echo -e "  ${Y}Next step: Open the UI and scan the QR code with WhatsApp${N}"
echo ""
pm2 status
