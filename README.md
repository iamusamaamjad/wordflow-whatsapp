# 📱 WhatsApp Gateway

> **Apne WhatsApp number ko REST API mein convert karo — ek baar QR scan karo, phir kahi se bhi messages bhejo.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://docker.com)

---

## ✨ Kya Karta Hai?

Yeh project aapke WhatsApp number ko ek REST API mein convert karta hai. Ek baar QR code scan karo — phir apni website, app, ya kisi bhi tool se WhatsApp messages bhejo.

```
Aapki App  →  POST /api/send  →  Gateway  →  WhatsApp
```

---

## 🚀 5 Minute Setup

### Step 1 — Clone karo

```bash
git clone https://github.com/iamusamaamjad/wordflow-whatsapp.git
cd wordflow-whatsapp
```

### Step 2 — Setup run karo

```bash
bash setup.sh
```

Yeh script automatically install karti hai:
- ✅ Docker
- ✅ Node.js
- ✅ PM2 (process manager)
- ✅ wacli (WhatsApp engine)

### Step 3 — QR Scan karo

Browser mein kholo: **http://localhost:3095**

1. WhatsApp mobile app kholo
2. 3-dot menu → **Linked Devices** → **Link a Device**
3. QR code scan karo
4. ✅ Connected! Ab aapka WhatsApp number API ready hai

---

## 🔑 Apni API Use Karna

Gateway connect hone ke baad, aap apne server URL se messages bhej sakte hain.

### Base URL

```
http://YOUR_SERVER_IP:3095
```

Ya agar domain pe deploy kiya hai:
```
https://yourdomain.com/whatsapp
```

---

### 📨 Single Message Bhejna

```bash
curl -X POST http://localhost:3095/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "923001234567",
    "message": "Hello! Yeh message WhatsApp Gateway se aaya hai."
  }'
```

**Response:**
```json
{
  "success": true,
  "to": "923001234567",
  "message": "Hello! Yeh message WhatsApp Gateway se aaya hai."
}
```

> **Number format:** Country code + number, koi `+` ya spaces nahi  
> Pakistan: `923001234567` | USA: `14155551234` | UK: `447911123456`

---

### 📨 Bulk Messages (Multiple Numbers)

```bash
curl -X POST http://localhost:3095/api/send-bulk \
  -H "Content-Type: application/json" \
  -d '{
    "numbers": [
      "923001234567",
      "923009876543",
      "14155551234"
    ],
    "message": "Yeh bulk message hai sabke liye!",
    "delayMs": 2000
  }'
```

Bulk send **real-time progress** deta hai — har message ke baad update aata hai:
```
{"to":"923001234567","success":true,"index":1,"total":3}
{"to":"923009876543","success":true,"index":2,"total":3}
{"to":"14155551234","success":true,"index":3,"total":3}
{"done":true,"total":3,"sent":3}
```

---

### 📊 Connection Status Check

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
| `POST` | `/api/send` | Single message bhejna |
| `POST` | `/api/send-bulk` | Multiple numbers pe bulk send (streaming) |
| `POST` | `/api/reconnect` | Session disconnect ho jaye to reconnect |
| `POST` | `/api/logout` | WhatsApp unlink karna |
| `GET` | `/api/logs` | Server logs (last 100 lines) |
| `GET` | `/api/logs/stream` | Live logs stream (SSE) |

---

## 💻 Code Examples

### JavaScript / Node.js

```javascript
// Single message
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

# Single message
r = requests.post('http://localhost:3095/api/send', json={
    'to': '923001234567',
    'message': 'Hello from Python!'
})
print(r.json())  # {'success': True, 'to': '923001234567'}
```

### PHP

```php
$ch = curl_init('http://localhost:3095/api/send');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'to' => '923001234567',
    'message' => 'Hello from PHP!'
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = json_decode(curl_exec($ch), true);
```

### n8n / Make / Zapier

HTTP Request node use karo:
- **Method:** POST
- **URL:** `http://YOUR_IP:3095/api/send`
- **Body (JSON):** `{"to": "923001234567", "message": "Hello!"}`

---

## ⚙️ Environment Variables

Setup ko customize karne ke liye:

```bash
WA_PORT=8080 \
WA_DATA_DIR=/var/whatsapp-data \
WA_PM2_NAME=my-gateway \
bash setup.sh
```

| Variable | Default | Description |
|----------|---------|-------------|
| `WA_PORT` | `3095` | Server port |
| `WA_DATA_DIR` | `~/wacli-data` | WhatsApp session storage folder |
| `WA_PM2_NAME` | `whatsapp-gateway` | PM2 process name |
| `WA_IMAGE` | `wacli` | Docker image name |

---

## 🌐 Domain Pe Deploy Karna (Nginx)

Agar aap `https://yoursite.com/whatsapp` pe run karna chahte hain:

```nginx
location = /whatsapp { return 301 /whatsapp/; }
location /whatsapp/ {
    proxy_pass http://localhost:3095/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection '';
    # SSE aur bulk streaming ke liye zaroori
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}
```

---

## 🔄 Useful Commands

```bash
# Gateway status dekho
pm2 status

# Live logs dekho
pm2 logs whatsapp-gateway

# Restart karo
pm2 restart whatsapp-gateway

# Stop karo
pm2 stop whatsapp-gateway

# wacli image rebuild karo (update ke liye)
docker rmi wacli && bash setup.sh
```

---

## ❓ Troubleshooting

**QR show nahi ho raha?**
```bash
pm2 logs whatsapp-gateway --lines 50
```
Docker chal raha hai? `docker ps` se check karo.

**Message send nahi ho raha?**
```bash
curl http://localhost:3095/api/status
# state "CONNECTED" hona chahiye
```
Agar disconnect hai to UI mein "Reconnect" button dabao.

**Session baar baar disconnect hota hai?**  
WhatsApp pe jao → Linked Devices → check karo ke device listed hai ya nahi. Agar nahi hai to dubara QR scan karo.

**macOS pe Docker nahi chal raha?**  
[Docker Desktop](https://www.docker.com/products/docker-desktop/) install karo, phir `bash setup.sh` chalao.

---

## 📦 Project Structure

```
wordflow-whatsapp/
├── setup.sh              ← One-command installer
├── gateway/
│   ├── server.js         ← Express API server
│   ├── package.json
│   └── public/
│       └── index.html    ← Web UI (QR scan + send + logs)
└── README.md
```

---

## 🛠️ How It Works

```
┌─────────────┐     POST /api/send      ┌─────────────────┐
│  Your App   │ ──────────────────────► │  Gateway        │
│  (any lang) │                         │  (Node.js)      │
└─────────────┘                         │                 │
                                        │  sendQueue      │ ← No race conditions
                                        │  (serialized)   │
                                        └────────┬────────┘
                                                 │  docker run wacli send
                                        ┌────────▼────────┐
                                        │  wacli          │ ← WhatsApp protocol
                                        │  (Docker)       │
                                        └────────┬────────┘
                                                 │
                                        ┌────────▼────────┐
                                        │  WhatsApp       │
                                        │  Servers        │
                                        └─────────────────┘
```

- **Session storage:** `WA_DATA_DIR` folder mein — ek baar scan, hamesha connected
- **Queue system:** Sab sends ek serial queue se guzarte hain — koi conflict nahi
- **Auto-reconnect:** Send fail hone pe automatically session check aur restart

---

## 📄 License

MIT — Free to use, modify, and distribute.

---

## 🙏 Credits

WhatsApp protocol engine: [openclaw/wacli](https://github.com/openclaw/wacli)
