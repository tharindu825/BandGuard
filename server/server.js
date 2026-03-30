// ============================================================
// server.js — Internet Usage Tracker Backend
// Express + better-sqlite3 REST API
// Run: node server.js  (or: npm start)
// ============================================================

const express  = require('express');
const Database = require('better-sqlite3');
const cors     = require('cors');
const { exec } = require('child_process');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'usage.db');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');      // Better concurrent performance
db.pragma('synchronous = NORMAL');    // Balanced durability/speed
db.pragma('foreign_keys = ON');

// Inline schema init — runs on every startup, safe due to IF NOT EXISTS
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name    TEXT    UNIQUE NOT NULL,
    device_ip      TEXT    NOT NULL,
    dl_limit_mb    INTEGER DEFAULT 0,
    ul_limit_mb    INTEGER DEFAULT 0,
    total_limit_mb INTEGER DEFAULT 0,
    is_blocked     INTEGER DEFAULT 0,
    last_seen      TEXT,
    created_at     TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name    TEXT    NOT NULL,
    device_ip      TEXT    NOT NULL,
    download_bytes INTEGER DEFAULT 0,
    upload_bytes   INTEGER DEFAULT 0,
    timestamp      TEXT    NOT NULL,
    date           TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_log_device_date ON usage_log (device_name, date);
  CREATE INDEX IF NOT EXISTS idx_log_date        ON usage_log (date);

  CREATE VIEW IF NOT EXISTS daily_summary AS
    SELECT
      device_name,
      device_ip,
      date,
      CAST(SUM(download_bytes) / 1048576.0 AS REAL) AS download_mb,
      CAST(SUM(upload_bytes)   / 1048576.0 AS REAL) AS upload_mb,
      CAST((SUM(download_bytes) + SUM(upload_bytes)) / 1048576.0 AS REAL) AS total_mb,
      COUNT(*) AS report_count
    FROM usage_log
    GROUP BY device_name, date;
    
  CREATE TABLE IF NOT EXISTS block_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name  TEXT NOT NULL,
    device_ip    TEXT NOT NULL,
    reason       TEXT,
    blocked_at   TEXT NOT NULL,
    unblocked_at TEXT
  );
`);

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve React build (production)
const BUILD_PATH = path.join(__dirname, '../client/dist');
if (fs.existsSync(BUILD_PATH)) {
  app.use(express.static(BUILD_PATH));
  console.log(`✓ Serving React UI from ${BUILD_PATH}`);
}

// ── Helper: derive online status ──────────────────────────
function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 3 * 60 * 1000; // 3min window
}

// ── Helper: run PowerShell block/unblock script ───────────
function runBlockScript(scriptName, deviceIP) {
  const scriptPath = path.join(__dirname, 'scripts', scriptName);
  const cmd = `powershell.exe -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" -DeviceIP "${deviceIP}"`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`[SCRIPT ERROR] ${scriptName} for ${deviceIP}: ${err.message}`);
    } else {
      console.log(`[SCRIPT OK] ${scriptName} for ${deviceIP}`);
      if (stdout.trim()) console.log(`  stdout: ${stdout.trim()}`);
    }
  });
}

// ============================================================
// API ROUTES
// ============================================================

// ── POST /api/usage — agent reports bytes ─────────────────
app.post('/api/usage', (req, res) => {
  const {
    device_name, device_ip,
    download_bytes, upload_bytes,
    timestamp, date
  } = req.body;

  if (!device_name || !device_ip || !timestamp || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const dlBytes = Math.max(0, parseInt(download_bytes) || 0);
  const ulBytes = Math.max(0, parseInt(upload_bytes)   || 0);

  // Upsert device record
  db.prepare(`
    INSERT OR IGNORE INTO devices (device_name, device_ip, last_seen)
    VALUES (?, ?, ?)
  `).run(device_name, device_ip, timestamp);

  db.prepare(`
    UPDATE devices SET last_seen = ?, device_ip = ? WHERE device_name = ?
  `).run(timestamp, device_ip, device_name);

  // Insert usage record
  db.prepare(`
    INSERT INTO usage_log (device_name, device_ip, download_bytes, upload_bytes, timestamp, date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(device_name, device_ip, dlBytes, ulBytes, timestamp, date);

  // ── Quota enforcement ──
  const device = db.prepare(`SELECT * FROM devices WHERE device_name = ?`).get(device_name);
  const today  = db.prepare(`SELECT * FROM daily_summary WHERE device_name = ? AND date = ?`).get(device_name, date);

  if (device && !device.is_blocked) {
    const dlMb    = today?.download_mb || 0;
    const ulMb    = today?.upload_mb   || 0;
    const totalMb = today?.total_mb    || 0;

    const dlExceeded    = device.dl_limit_mb    > 0 && dlMb    >= device.dl_limit_mb;
    const ulExceeded    = device.ul_limit_mb    > 0 && ulMb    >= device.ul_limit_mb;
    const totalExceeded = device.total_limit_mb > 0 && totalMb >= device.total_limit_mb;

    if (dlExceeded || ulExceeded || totalExceeded) {
      const reason = dlExceeded ? 'DL limit' : ulExceeded ? 'UL limit' : 'Total limit';
      db.prepare(`UPDATE devices SET is_blocked = 1 WHERE device_name = ?`).run(device_name);
      db.prepare(`INSERT INTO block_log (device_name, device_ip, reason, blocked_at) VALUES (?, ?, ?, ?)`).run(device_name, device_ip, reason, timestamp);
      runBlockScript('block_device.ps1', device_ip);
      console.log(`[QUOTA EXCEEDED] ${device_name} (${device_ip}) — ${reason} hit`);
    }
  }

  res.json({ status: 'ok', is_blocked: device?.is_blocked ?? 0 });
});

// ── GET /api/dashboard — full data for React UI ───────────
app.get('/api/dashboard', (req, res) => {
  const devices = db.prepare(`SELECT * FROM devices ORDER BY device_name`).all();
  const today   = new Date().toISOString().split('T')[0];

  const todaySummary = db.prepare(`
    SELECT * FROM daily_summary WHERE date = ?
  `).all(today);

  const history = db.prepare(`
    SELECT * FROM daily_summary
    WHERE date >= date('now', '-30 days')
    ORDER BY date DESC, device_name
  `).all();

  const devicesWithStatus = devices.map(d => ({
    ...d,
    is_online: isOnline(d.last_seen)
  }));

  res.json({
    devices:       devicesWithStatus,
    today_summary: todaySummary,
    history
  });
});

// ── GET /api/devices — device list ───────────────────────
app.get('/api/devices', (req, res) => {
  const devices = db.prepare(`SELECT * FROM devices ORDER BY device_name`).all();
  res.json(devices.map(d => ({ ...d, is_online: isOnline(d.last_seen) })));
});

// ── GET /api/devices/status/:name — polled by agent for self-enforcement ─
app.get('/api/devices/status/:name', (req, res) => {
  const device = db.prepare(
      `SELECT is_blocked FROM devices WHERE device_name = ?`
  ).get(req.params.name);

  if (!device) return res.json({ is_blocked: 0 });
  res.json({ is_blocked: device.is_blocked });
});

// ── GET /api/history/:name — per-device 30-day history ───
app.get('/api/history/:name', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM daily_summary
    WHERE device_name = ?
    ORDER BY date ASC
    LIMIT 30
  `).all(req.params.name);
  res.json(rows);
});

// ── PUT /api/devices/:name/limit — set quota ─────────────
app.put('/api/devices/:name/limit', (req, res) => {
  const { dl_limit_mb = 0, ul_limit_mb = 0, total_limit_mb = 0 } = req.body;
  const result = db.prepare(`
    UPDATE devices SET dl_limit_mb = ?, ul_limit_mb = ?, total_limit_mb = ?
    WHERE device_name = ?
  `).run(
    parseInt(dl_limit_mb)    || 0,
    parseInt(ul_limit_mb)    || 0,
    parseInt(total_limit_mb) || 0,
    req.params.name
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Device not found' });
  res.json({ status: 'updated' });
});

// ── PUT /api/devices/:name/block — manual block ──────────
app.put('/api/devices/:name/block', (req, res) => {
  const device = db.prepare(`SELECT * FROM devices WHERE device_name = ?`).get(req.params.name);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  db.prepare(`UPDATE devices SET is_blocked = 1 WHERE device_name = ?`).run(req.params.name);
  db.prepare(`INSERT INTO block_log (device_name, device_ip, reason, blocked_at) VALUES (?, ?, ?, ?)`).run(req.params.name, device.device_ip, 'Manual block', new Date().toISOString());
  runBlockScript('block_device.ps1', device.device_ip);
  res.json({ status: 'blocked' });
});

// ── PUT /api/devices/:name/unblock — unblock ─────────────
app.put('/api/devices/:name/unblock', (req, res) => {
  const device = db.prepare(`SELECT * FROM devices WHERE device_name = ?`).get(req.params.name);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  db.prepare(`UPDATE devices SET is_blocked = 0 WHERE device_name = ?`).run(req.params.name);
  db.prepare(`UPDATE block_log SET unblocked_at = ? WHERE device_name = ? AND unblocked_at IS NULL`)
    .run(new Date().toISOString(), req.params.name);
  runBlockScript('unblock_device.ps1', device.device_ip);
  res.json({ status: 'unblocked' });
});

// ── GET /api/devices/:name/blocklogs — view block history ─
app.get('/api/devices/:name/blocklogs', (req, res) => {
  const logs = db.prepare(`SELECT * FROM block_log WHERE device_name = ? ORDER BY blocked_at DESC LIMIT 30`).all(req.params.name);
  res.json(logs);
});

// ── POST /api/reset — unblock all devices (midnight reset)-
app.post('/api/reset', (req, res) => {
  const blocked = db.prepare(`SELECT device_name, device_ip FROM devices WHERE is_blocked = 1`).all();
  db.prepare(`UPDATE devices SET is_blocked = 0`).run();
  blocked.forEach(d => runBlockScript('unblock_device.ps1', d.device_ip));
  console.log(`[RESET] Unblocked ${blocked.length} device(s) at midnight reset`);
  res.json({ status: 'reset', unblocked: blocked.length });
});

// ── DELETE /api/devices/:name — remove device ────────────
app.delete('/api/devices/:name', (req, res) => {
  db.prepare(`DELETE FROM usage_log WHERE device_name = ?`).run(req.params.name);
  db.prepare(`DELETE FROM devices WHERE device_name = ?`).run(req.params.name);
  res.json({ status: 'deleted' });
});

// ── POST /api/devices/:name/reset-usage — reset today's usage ─
app.post('/api/devices/:name/reset-usage', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const device = db.prepare(`SELECT * FROM devices WHERE device_name = ?`).get(req.params.name);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  // Delete today's usage log entries for this device
  const result = db.prepare(`DELETE FROM usage_log WHERE device_name = ? AND date = ?`)
    .run(req.params.name, today);

  // Also unblock the device if it was blocked (quota no longer exceeded)
  if (device.is_blocked) {
    db.prepare(`UPDATE devices SET is_blocked = 0 WHERE device_name = ?`).run(req.params.name);
    db.prepare(`UPDATE block_log SET unblocked_at = ? WHERE device_name = ? AND unblocked_at IS NULL`)
      .run(new Date().toISOString(), req.params.name);
    runBlockScript('unblock_device.ps1', device.device_ip);
  }

  console.log(`[RESET] Usage reset for ${req.params.name} — ${result.changes} log entries deleted`);
  res.json({ status: 'reset', deleted: result.changes, unblocked: device.is_blocked === 1 });
});

// ── GET /api/stats — summary numbers for dashboard ───────
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM devices)                                AS total_devices,
      (SELECT COUNT(*) FROM devices WHERE is_blocked = 1)          AS blocked_devices,
      COALESCE(SUM(download_bytes) / 1048576.0, 0)                 AS total_dl_mb,
      COALESCE(SUM(upload_bytes)   / 1048576.0, 0)                 AS total_ul_mb,
      COALESCE((SUM(download_bytes)+SUM(upload_bytes))/1048576.0,0)AS total_mb
    FROM usage_log WHERE date = ?
  `).get(today);
  res.json(stats);
});

// ── Catch-all: serve React index.html for SPA routing ────
app.get('*', (req, res) => {
  const indexPath = path.join(BUILD_PATH, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: 'Usage Tracker API running. Build the React client first.' });
  }
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Internet Usage Tracker  v1.0       ║');
  console.log(`║   API listening on port ${PORT}          ║`);
  console.log(`║   Database: ${path.basename(DB_PATH)}              ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});
