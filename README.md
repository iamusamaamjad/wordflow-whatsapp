# WhatsApp Gateway

Scan WhatsApp QR once — send messages from anywhere via REST API.

## Quick Start

```bash
git clone https://github.com/Davidnmbkjh/wordflow-whatsapp.git
cd wordflow-whatsapp
bash setup.sh
```

Open **http://localhost:3095** → scan QR → done.

## API

```bash
# Send a message
curl -X POST http://localhost:3095/api/send \
  -H "Content-Type: application/json" \
  -d '{"to":"923001234567","message":"Hello!"}'

# Bulk send with live progress
curl -X POST http://localhost:3095/api/send-bulk \
  -H "Content-Type: application/json" \
  -d '{"numbers":["923001234567","14155551234"],"message":"Hi!","delayMs":2000}'

# Status
curl http://localhost:3095/api/status
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Connection state + queue depth |
| GET | `/api/qr` | QR code as base64 PNG |
| POST | `/api/send` | Send single message |
| POST | `/api/send-bulk` | Bulk send with streaming progress |
| POST | `/api/reconnect` | Restart auth / get new QR |
| POST | `/api/logout` | Unlink device |
| GET | `/api/logs` | Last 100 log lines |
| GET | `/api/logs/stream` | Live log stream (SSE) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WA_PORT` | `3095` | Port to listen on |
| `WA_DATA_DIR` | `~/wacli-data` | WhatsApp session storage |
| `WA_PM2_NAME` | `whatsapp-gateway` | PM2 process name |

Example:
```bash
WA_PORT=8080 WA_DATA_DIR=/var/wa-data bash setup.sh
```

## Behind Nginx (optional)

```nginx
location /whatsapp/ {
    proxy_pass http://localhost:3095/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}
```

## Requirements

- Docker
- Node.js v18+
- PM2 (`npm i -g pm2`)

The setup script installs all of these automatically on Ubuntu/Debian.  
On macOS, install Docker Desktop manually first, then run `bash setup.sh`.

## How It Works

```
Your App → POST /api/send → sendQueue → Docker(wacli) → WhatsApp
```

- **wacli** ([openclaw/wacli](https://github.com/openclaw/wacli)) handles WhatsApp protocol
- Session stored in `WA_DATA_DIR` — scan QR once, stays connected
- All sends serialized through a Promise queue — no race conditions
- Session loss auto-detected from send errors → auto-reconnect
