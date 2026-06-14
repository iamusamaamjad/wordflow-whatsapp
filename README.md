# 📱 WhatsApp Gateway

> **Turn your WhatsApp number into a REST API — scan QR once, send messages from anywhere.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://docker.com)

---

## ✨ What Does It Do?

This project converts your WhatsApp number into a REST API. Scan the QR code once — then send WhatsApp messages from your website, app, automation tool, or any HTTP client.

```
Your App  →  POST /api/send  →  Gateway  →  WhatsApp
```

---

## 🚀 5-Minute Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/iamusamaamjad/wordflow-whatsapp.git
cd wordflow-whatsapp
```

### Step 2 — Run the setup script

```bash
bash setup.sh
```

The script automatically installs everything:
- ✅ Docker
- ✅ Node.js
- ✅ PM2 (process manager)
- ✅ wacli (WhatsApp engine — built from source)

### Step 3 — Scan the QR code

Open in your browser: **http://localhost:3095**

1. Open WhatsApp on your phone
2. Tap **3-dot menu** → **Linked Devices** → **Link a Device**
3. Scan the QR code shown on screen
4. ✅ Connected! Your WhatsApp number is now an API

---

## 🔑 Using Your API

Once connected, use your server URL to send messages from anywhere.

### Base URL

```
http://YOUR_SERVER_IP:3095
```

Or if deployed with a domain:
```
https://yourdomain.com/whatsapp
```

---

### 📨 Send a Single Message

```bash
curl -X POST http://localhost:3095/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "923001234567",
    "message": "Hello! This message was sent via WhatsApp Gateway."
  }'
```

**Response:**
```json
{
  "success": true,
  "to": "923001234567",
  "message": "Hello! This message was sent via WhatsApp Gateway."
}
```

> **Phone number format:** Country code + number, no `+` or spaces  
> Pakistan: `923001234567` | USA: `14155551234` | UK: `447911123456`

---

### 📨 Send Bulk Messages

```bash
curl -X POST http://localhost:3095/api/send-bulk \
  -H "Content-Type: application/json" \
  -d '{
    "numbers": [
      "923001234567",
      "923009876543",
      "14155551234"
    ],
    "message": "Hello everyone! This is a bulk message.",
    "delayMs": 2000
  }'
```

Bulk send streams **real-time progress** — you get an update after every message:
```json
{"to":"923001234567","success":true,"index":1,"total":3}
{"to":"923009876543","success":true,"index":2,"total":3}
{"to":"14155551234","success":true,"index":3,"total":3}
{"done":true,"total":3,"sent":3}
```

---

### 📊 Check Connection Status

```bash
curl http://localhost:3095/api/status
```

```json
{
  "state": "CONNECTED",
  "connected": true,
  "phone": "923001234567",
  "queueDepth": 0
}
```

---

## 📋 Full API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Connection state, phone number, queue depth |
| `GET` | `/api/qr` | QR code image (base64 PNG) |
| `POST` | `/api/send` | Send a single message |
| `POST` | `/api/send-bulk` | Bulk send to multiple numbers (streaming progress) |
| `POST` | `/api/reconnect` | Reconnect if session is lost |
| `POST` | `/api/logout` | Unlink the WhatsApp device |
| `GET` | `/api/logs` | Last 100 server log lines |
| `GET` | `/api/logs/stream` | Live log stream (Server-Sent Events) |

---

## 💻 Code Examples

### JavaScript / Node.js

```javascript
// Send a single message
const response = await fetch('http://localhost:3095/api/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '923001234567',
    message: 'Hello from Node.js!'
  })
});
const result = await response.json();
console.log(result); // { success: true, to: '923001234567' }
```

### Python

```python
import requests

response = requests.post('http://localhost:3095/api/send', json={
    'to': '923001234567',
    'message': 'Hello from Python!'
})
print(response.json())  # {'success': True, 'to': '923001234567'}
```

### PHP

```php
$ch = curl_init('http://localhost:3095/api/send');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'to'      => '923001234567',
    'message' => 'Hello from PHP!'
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = json_decode(curl_exec($ch), true);
print_r($result);
```

### n8n / Make / Zapier

Use an **HTTP Request** node:
- **Method:** `POST`
- **URL:** `http://YOUR_IP:3095/api/send`
- **Body (JSON):** `{"to": "923001234567", "message": "Hello!"}`

---

## ⚙️ Environment Variables

Customize the setup with environment variables:

```bash
WA_PORT=8080 \
WA_DATA_DIR=/var/whatsapp-data \
WA_PM2_NAME=my-gateway \
bash setup.sh
```

| Variable | Default | Description |
|----------|---------|-------------|
| `WA_PORT` | `3095` | Port the server listens on |
| `WA_DATA_DIR` | `~/wacli-data` | WhatsApp session storage directory |
| `WA_PM2_NAME` | `whatsapp-gateway` | PM2 process name |
| `WA_IMAGE` | `wacli` | Docker image name |

---

## 🌐 Deploy Behind Nginx

To serve the gateway at `https://yoursite.com/whatsapp`:

```nginx
location = /whatsapp { return 301 /whatsapp/; }
location /whatsapp/ {
    proxy_pass http://localhost:3095/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection '';
    # Required for SSE (live logs) and NDJSON streaming (bulk send progress)
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}
```

---

## 🔄 Useful Commands

```bash
# Check gateway status
pm2 status

# View live logs
pm2 logs whatsapp-gateway

# Restart the gateway
pm2 restart whatsapp-gateway

# Stop the gateway
pm2 stop whatsapp-gateway

# Rebuild wacli Docker image (to get updates)
docker rmi wacli && bash setup.sh
```

---

## ❓ Troubleshooting

**QR code not showing?**
```bash
pm2 logs whatsapp-gateway --lines 50
```
Make sure Docker is running: `docker ps`

**Messages not sending?**
```bash
curl http://localhost:3095/api/status
# "state" should be "CONNECTED"
```
If disconnected, click the **Reconnect** button in the web UI.

**Session keeps disconnecting?**  
On your phone, go to WhatsApp → Linked Devices and check that the device is still listed. If not, scan the QR code again.

**Docker not running on macOS?**  
Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) first, then run `bash setup.sh`.

---

## 📦 Project Structure

```
wordflow-whatsapp/
├── setup.sh              ← One-command installer (Linux & macOS)
├── gateway/
│   ├── server.js         ← Express API server
│   ├── package.json
│   └── public/
│       └── index.html    ← Web UI (QR scan, send tester, live logs)
└── README.md
```

---

## 🛠️ How It Works

```
┌─────────────┐    POST /api/send     ┌──────────────────┐
│  Your App   │ ────────────────────► │  Gateway         │
│  (any lang) │                       │  (Node.js)       │
└─────────────┘                       │                  │
                                      │  Send Queue      │ ← Serialized, no conflicts
                                      └────────┬─────────┘
                                               │  docker run wacli send
                                      ┌────────▼─────────┐
                                      │  wacli           │ ← WhatsApp protocol
                                      │  (Docker)        │
                                      └────────┬─────────┘
                                               │
                                      ┌────────▼─────────┐
                                      │  WhatsApp        │
                                      │  Servers         │
                                      └──────────────────┘
```

**Key design decisions:**
- **Session persistence** — stored in `WA_DATA_DIR`, survives server restarts
- **Send queue** — all messages pass through a serial Promise queue, eliminating race conditions
- **Auto-reconnect** — session loss detected from send errors, auth restarts automatically
- **Zero polling overhead** — health check skips Docker calls when already connected (runs every 5 min only when disconnected)

---

## 📄 License

MIT — Free to use, modify, and distribute.

---

## 🙏 Credits

WhatsApp protocol engine: [openclaw/wacli](https://github.com/openclaw/wacli)
