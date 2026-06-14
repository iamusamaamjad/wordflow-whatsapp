const express = require('express');
const { spawn, execFile } = require('child_process');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT     = process.env.WA_PORT       || 3095;
const DATA_DIR = process.env.WA_DATA_DIR   || '/root/wacli-data';
const DOCKER_IMG = process.env.WA_IMAGE    || 'wacli';

// ── In-memory log buffer ──────────────────────────────────────────────────────
const LOG_MAX = 200;
const logBuffer = [];
const sseClients = [];

function log(tag, ...parts) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${tag}] ` + parts.map(p => typeof p === 'object' ? JSON.stringify(p) : String(p)).join(' ');
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
  const payload = 'data: ' + JSON.stringify(line) + '\n\n';
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(payload); } catch { sseClients.splice(i, 1); }
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let state = 'INIT';
let currentQRString = null;
let currentQRReceivedAt = null;
let qrCount = 0;
let connectedPhone = null;
let authProc = null;
let sendQueue = Promise.resolve();
let queueDepth = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
function dockerArgs(cmdArgs) {
  return ['run', '--rm', '-v', `${DATA_DIR}:/data`, DOCKER_IMG, ...cmdArgs];
}

function isAuthenticated() {
  return new Promise((resolve) => {
    const args = dockerArgs(['auth', 'status', '--json']);
    log('AUTH_CHK', 'Running:', 'docker ' + args.join(' '));
    execFile('docker', args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        log('AUTH_CHK', 'Error:', err.message);
        if (stderr) log('AUTH_CHK', 'Stderr:', stderr.trim());
        return resolve(false);
      }
      log('AUTH_CHK', 'Stdout:', stdout.trim());
      try {
        const j = JSON.parse(stdout.trim());
        const authed = j.authenticated === true || j.data?.authenticated === true;
        log('AUTH_CHK', 'Authenticated?', authed);
        if (authed) {
          const raw = j.phone || j.data?.phone || j.linked_jid || j.data?.linked_jid || '';
          if (raw) connectedPhone = raw.replace(/@s\.whatsapp\.net$/, '');
        }
        resolve(authed);
      } catch (e) {
        log('AUTH_CHK', 'JSON parse error:', e.message, 'raw:', stdout.trim());
        resolve(false);
      }
    });
  });
}

// ── Auth / QR flow ────────────────────────────────────────────────────────────
async function startAuth() {
  if (authProc) {
    log('AUTH', 'Killing existing auth process PID', authProc.pid);
    authProc.kill();
    authProc = null;
    await new Promise(r => setTimeout(r, 500));
  }

  log('AUTH', '--- Auth flow starting ---');
  const alreadyAuthed = await isAuthenticated();
  if (alreadyAuthed) {
    state = 'CONNECTED';
    log('AUTH', 'Already authenticated! Phone:', connectedPhone, '— skipping QR');
    return;
  }

  log('AUTH', 'Not authenticated — starting Docker wacli auth process');
  state = 'INIT';
  currentQRString = null;
  currentQRReceivedAt = null;
  qrCount = 0;

  const args = dockerArgs(['auth', '--qr-format', 'text']);
  log('AUTH', 'Spawning:', 'docker ' + args.join(' '));

  authProc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  log('AUTH', 'Auth process started, PID:', authProc.pid);

  authProc.stdout.on('data', (chunk) => {
    const raw = chunk.toString();
    log('AUTH', 'STDOUT chunk received, bytes:', raw.length);
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.length > 20 && !line.startsWith('{') && !line.startsWith('[') && !line.startsWith('warning')) {
        qrCount++;
        currentQRString = line;
        currentQRReceivedAt = new Date();
        state = 'QR_READY';
        log('AUTH', `>>> QR #${qrCount} ready at ${currentQRReceivedAt.toISOString()}, length: ${line.length} chars`);
      } else {
        log('AUTH', 'STDOUT other:', line);
      }
    }
  });

  authProc.stderr.on('data', (chunk) => {
    const txt = chunk.toString().trim();
    if (!txt) return;
    log('AUTH', 'STDERR:', txt);
    if (/authenticated|logged in|linked|success/i.test(txt)) log('AUTH', '>>> POSSIBLE AUTH SUCCESS in stderr!');
    if (/outdated|Outdated/i.test(txt))    log('AUTH', '!!! CLIENT OUTDATED ERROR — wacli version rejected by WhatsApp');
    if (/multi.?device/i.test(txt))        log('AUTH', '!!! MULTI-DEVICE NOT ENABLED on phone');
    if (/timed out|timeout/i.test(txt))    log('AUTH', '!!! QR CODE TIMED OUT — retrying...');
    if (/pairing failed|link failed/i.test(txt)) log('AUTH', '!!! PAIRING FAILED:', txt);
  });

  authProc.on('error', (err) => {
    log('AUTH', '!!! Process spawn error:', err.message);
  });

  authProc.on('close', async (code, signal) => {
    log('AUTH', `--- Auth process closed. code=${code} signal=${signal} totalQR=${qrCount} ---`);
    authProc = null;
    const authed = await isAuthenticated();
    if (authed) {
      state = 'CONNECTED';
      currentQRString = null;
      log('AUTH', '>>> AUTH CONFIRMED after process exit! Phone:', connectedPhone);
    } else if (state !== 'CONNECTED') {
      log('AUTH', 'NOT authenticated after exit. state → DISCONNECTED');
      state = 'DISCONNECTED';
    }
  });
}

// ── Periodic auth health check (every 5 min) ─────────────────────────────────
// When CONNECTED: skip — disconnect detected from send errors instead.
// When DISCONNECTED/INIT: check every 5 min in case auth succeeded externally.
setInterval(async () => {
  if (state === 'CONNECTED' || state === 'QR_READY' || authProc) return;
  log('HEALTH', 'Checking auth status (state:', state + ')');
  const authed = await isAuthenticated();
  if (authed) {
    state = 'CONNECTED';
    log('HEALTH', 'State updated → CONNECTED, phone:', connectedPhone);
  }
}, 300000);

// ── Detect session loss from send errors ──────────────────────────────────────
function checkSendError(errText) {
  if (/not authenticated|not logged|session|unauthorized|disconnected|forbidden/i.test(errText)) {
    if (state === 'CONNECTED') {
      log('SESSION', 'Send error suggests session lost → restarting auth');
      state = 'DISCONNECTED';
      startAuth();
    }
  }
}

// ── REST API ──────────────────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const n = Math.min(parseInt(req.query.n || '100'), LOG_MAX);
  res.json({ lines: logBuffer.slice(-n) });
});

app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  for (const line of logBuffer.slice(-50)) {
    res.write('data: ' + JSON.stringify(line) + '\n\n');
  }
  sseClients.push(res);
  req.on('close', () => {
    const i = sseClients.indexOf(res);
    if (i !== -1) sseClients.splice(i, 1);
    log('SSE', 'Client disconnected, remaining:', sseClients.length);
  });
  log('SSE', 'Client connected, total:', sseClients.length);
});

app.get('/api/status', (req, res) => {
  res.json({ state, connected: state === 'CONNECTED', phone: connectedPhone || null, qrCount, queueDepth });
});

app.get('/api/qr', async (req, res) => {
  log('API', 'GET /api/qr — state:', state, 'hasQR:', !!currentQRString);
  if (state === 'CONNECTED') return res.json({ connected: true });
  if (!currentQRString) return res.status(503).json({ error: 'QR not ready yet. Try again in a moment.' });
  const ageMs = currentQRReceivedAt ? Date.now() - currentQRReceivedAt.getTime() : null;
  log('API', `Serving QR #${qrCount}, age: ${ageMs}ms`);
  try {
    const img = await qrcode.toDataURL(currentQRString, { scale: 8 });
    res.json({ qr: img, refreshedAt: currentQRReceivedAt?.toISOString(), qrNumber: qrCount, ageMs });
  } catch (err) {
    log('API', 'QR toDataURL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send', (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: '"to" and "message" are required.' });
  const phone = String(to).replace(/[^0-9]/g, '');
  if (!phone) return res.status(400).json({ error: 'Invalid phone number.' });
  if (state !== 'CONNECTED') return res.status(503).json({ error: 'WhatsApp not connected. Scan QR first.', state });

  log('API', `POST /api/send to:${phone} queueDepth:${queueDepth}`);
  if (queueDepth >= 5) {
    return res.status(503).json({ error: `Send queue busy (${queueDepth} pending). Try again shortly.` });
  }
  queueDepth++;
  sendQueue = sendQueue.then(() => new Promise((resolve) => {
    const args = dockerArgs(['send', 'text', '--to', phone, '--message', message, '--post-send-wait', '0']);
    execFile('docker', args, { timeout: 30000 }, (err, stdout, stderr) => {
      const errText = stderr?.trim() || '';
      queueDepth--;
      if (err) {
        log('API', 'send FAILED to', phone, ':', errText || err.message);
        checkSendError(errText || err.message);
        try { res.status(500).json({ error: errText || err.message, detail: errText }); } catch {}
      } else {
        log('API', 'send OK to', phone, '| stdout:', stdout?.trim());
        try { res.json({ success: true, to: phone, message }); } catch {}
      }
      resolve();
    });
  }));
});

app.post('/api/send-bulk', (req, res) => {
  const { numbers, message, delayMs } = req.body || {};
  if (!Array.isArray(numbers) || !numbers.length || !message)
    return res.status(400).json({ error: '"numbers" array and "message" are required.' });
  if (state !== 'CONNECTED') return res.status(503).json({ error: 'WhatsApp not connected. Scan QR first.', state });

  const phones = numbers.map(n => String(n).replace(/[^0-9]/g, '')).filter(Boolean);
  const delay = Math.max(Number(delayMs) || 2000, 500);
  log('API', `POST /api/send-bulk count:${phones.length} delay:${delay}ms queueDepth:${queueDepth}`);
  queueDepth += phones.length;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();

  const results = [];
  let chain = sendQueue;

  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i];
    const idx = i;
    chain = chain.then(() => new Promise((resolve) => {
      log('API', `bulk [${idx + 1}/${phones.length}] → ${phone}`);
      const args = dockerArgs(['send', 'text', '--to', phone, '--message', message, '--post-send-wait', '0']);
      execFile('docker', args, { timeout: 30000 }, (err, stdout, stderr) => {
        const errText = stderr?.trim() || '';
        const entry = err
          ? { to: phone, success: false, error: errText || err.message, index: idx + 1, total: phones.length }
          : { to: phone, success: true, index: idx + 1, total: phones.length };
        results.push(entry);
        queueDepth--;
        log('API', `bulk [${idx + 1}/${phones.length}] ${err ? 'FAIL' : 'OK'} → ${phone}`);
        if (err) checkSendError(errText || err.message);
        try { res.write(JSON.stringify(entry) + '\n'); } catch {}
        resolve();
      });
    })).then(() => idx < phones.length - 1 ? new Promise(r => setTimeout(r, delay)) : undefined);
  }

  sendQueue = chain;
  chain.then(() => {
    const sent = results.filter(r => r.success).length;
    log('API', `bulk DONE ${sent}/${phones.length}`);
    try { res.end(JSON.stringify({ done: true, total: phones.length, sent }) + '\n'); } catch {}
  });
});

app.post('/api/reconnect', async (req, res) => {
  log('API', 'POST /api/reconnect — restarting auth');
  state = 'INIT';
  currentQRString = null;
  currentQRReceivedAt = null;
  qrCount = 0;
  await startAuth();
  if (state === 'CONNECTED') {
    res.json({ ok: true, state: 'CONNECTED', message: 'Already authenticated. No QR needed.', phone: connectedPhone });
  } else {
    res.json({ ok: true, state, message: 'Auth started. Scan the QR code shown in the UI.' });
  }
});

app.post('/api/logout', (req, res) => {
  log('API', 'POST /api/logout');
  if (authProc) { authProc.kill(); authProc = null; }
  state = 'DISCONNECTED';
  currentQRString = null;
  const args = dockerArgs(['auth', 'logout']);
  execFile('docker', args, { timeout: 15000 }, (err, stdout, stderr) => {
    if (err) {
      log('API', 'logout error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    log('API', 'Logout success');
    res.json({ success: true, message: 'Logged out. Use /api/reconnect to pair again.' });
  });
});

// ── JSON body-parse error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in request body.' });
  next(err);
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  log('GW', '========== WhatsApp Gateway starting ==========');
  log('GW', `Port:${PORT} | Data:${DATA_DIR} | Image:${DOCKER_IMG}`);
  await startAuth();
});
