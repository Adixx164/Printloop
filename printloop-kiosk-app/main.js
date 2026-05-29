/**
 * ─────────────────────────────────────────────────────────────────────
 *  PrintLoop Kiosk — Electron main process
 *  ─────────────────────────────────────────────────────────────────────
 *  Single-binary distribution: the .exe an operator double-clicks
 *  installs, configures, polls the cloud, AND dispatches to the
 *  printer. No PowerShell, no Node install, no Scheduled Task, no
 *  sidecar agent process.
 *
 *  Flow on first launch:
 *    1. Read config from userData/config.json.
 *    2. If missing or invalid → show the setup wizard (setup.html).
 *    3. Wizard saves config → close wizard, persist, set login-item,
 *       start the embedded agent (agent.js) + open the kiosk UI.
 *    4. On subsequent launches → skip the wizard, jump straight to
 *       step 3.
 *
 *  Operator hotkeys (USB keyboard during maintenance):
 *    Ctrl+Shift+S  → re-open the setup wizard (change cloud URL / key
 *                    / printer IP without re-installing the app)
 *    Ctrl+Shift+Q  → quit the app
 * ─────────────────────────────────────────────────────────────────────
 */

const { app, BrowserWindow, globalShortcut, Menu, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const axios = require('axios');
const { startAgent } = require('./agent.js');
const { discoverAll } = require('./discovery.js');

// ── File logger ─────────────────────────────────────────────────────
// Mirror console output to userData/app.log so production builds (no
// attached console) leave a paper trail for diagnosing agent issues.
let logStream = null;
function ensureLogger() {
  if (logStream) return;
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    logStream = fs.createWriteStream(path.join(dir, 'app.log'), { flags: 'a' });
    const ts = () => new Date().toISOString();
    const orig = { log: console.log, error: console.error, warn: console.warn };
    const fmt = (args) => args.map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');
    console.log = (...a) => { try { logStream.write(`[${ts()}] [log] ${fmt(a)}\n`); } catch {} orig.log(...a); };
    console.warn = (...a) => { try { logStream.write(`[${ts()}] [warn] ${fmt(a)}\n`); } catch {} orig.warn(...a); };
    console.error = (...a) => { try { logStream.write(`[${ts()}] [err] ${fmt(a)}\n`); } catch {} orig.error(...a); };
    console.log('=== app boot ===');
  } catch (e) {
    // Don't crash the app over logger init.
  }
}

// ── Single-instance lock ────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let kioskWin = null;
let setupWin = null;
let stopAgent = null;

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

/**
 * Normalize a stored baseUrl — defence against hand-edited config files
 * that omit the scheme (e.g. just `printloop-production.up.railway.app`).
 * Axios / Node's URL parser silently treats schemeless strings as
 * relative paths, which causes ENOTFOUND / weird routing. Always force
 * a valid absolute URL before handing it to the agent.
 */
function normalizeBaseUrl(raw) {
  let v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
  return 'https://' + v.replace(/^\/+/, '').replace(/\/+$/, '');
}

// ── Config persistence ──────────────────────────────────────────────
function readConfig() {
  try {
    let raw = fs.readFileSync(CONFIG_PATH(), 'utf8');
    // Strip UTF-8 BOM if present — Notepad / PowerShell `Out-File -Encoding utf8`
    // both write it, and JSON.parse rejects strings starting with U+FEFF.
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const cfg = JSON.parse(raw);
    if (cfg && typeof cfg === 'object' && cfg.baseUrl) {
      cfg.baseUrl = normalizeBaseUrl(cfg.baseUrl);
    }
    return cfg;
  } catch (e) {
    console.warn('[main] readConfig failed:', e && e.message);
    return null;
  }
}

function writeConfig(cfg) {
  const p = CONFIG_PATH();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
}

function configIsComplete(cfg) {
  return !!(cfg && cfg.baseUrl && cfg.kioskKey && cfg.printerIp);
}

// ── Setup wizard ────────────────────────────────────────────────────
function openSetupWindow() {
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.focus();
    return;
  }
  setupWin = new BrowserWindow({
    width: 720,
    height: 760,
    show: false,
    resizable: false,
    fullscreen: false,
    kiosk: false,
    autoHideMenuBar: true,
    backgroundColor: '#F8F4ED',
    title: 'PrintLoop Kiosk — Setup',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'setup-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  setupWin.loadFile(path.join(__dirname, 'setup.html'));
  setupWin.once('ready-to-show', () => {
    setupWin.show();
    setupWin.focus();
  });
  setupWin.on('closed', () => { setupWin = null; });
}

// ── Kiosk window ────────────────────────────────────────────────────
function openKioskWindow() {
  if (kioskWin && !kioskWin.isDestroyed()) {
    kioskWin.focus();
    return;
  }
  kioskWin = new BrowserWindow({
    show: false,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#F8F4ED',
    title: 'PrintLoop Kiosk',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      // Preload exposes `window.printloopKiosk.onAgentEvent(...)` so the
      // touchscreen UI can subscribe to dispatch + confirmation events
      // from the bundled agent, without losing contextIsolation.
      preload: path.join(__dirname, 'kiosk-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: process.env.PRINTLOOP_KIOSK_DEV === '1',
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);

  // The bundled HTML reads its cloud URL + kiosk key from
  // localStorage. We seed those from our saved config before the page
  // loads via a one-shot `did-finish-load` script, so the page comes
  // up already connected — no in-page settings step required.
  const cfg = readConfig() || {};
  kioskWin.webContents.on('did-finish-load', async () => {
    // Use the page's existing LS keys (see printloop-kiosk/index.html
    // → `var LS = { base:"pl_kiosk_apiBase", key:"pl_kiosk_key" }`).
    // The page reads localStorage at boot, so if our values don't
    // match what's already stored we set them and reload ONCE. The
    // localStorage origin is file:// + page path → persistent across
    // launches, so on subsequent boots the values already match and
    // we skip the reload entirely.
    const wantBase = cfg.baseUrl || '';
    const wantKey = cfg.kioskKey || '';
    try {
      const current = await kioskWin.webContents.executeJavaScript(
        `({ base: localStorage.getItem('pl_kiosk_apiBase') || '', key: localStorage.getItem('pl_kiosk_key') || '' })`,
      );
      if (current.base === wantBase && current.key === wantKey) return; // already in sync
      await kioskWin.webContents.executeJavaScript(
        `localStorage.setItem('pl_kiosk_apiBase', ${JSON.stringify(wantBase)});` +
        `localStorage.setItem('pl_kiosk_key', ${JSON.stringify(wantKey)});` +
        `location.reload();`,
      );
    } catch (e) {
      console.warn('[kiosk] config seed failed', e && e.message);
    }
  });

  kioskWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  kioskWin.once('ready-to-show', () => {
    kioskWin.show();
    kioskWin.focus();
  });
  kioskWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  kioskWin.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  kioskWin.on('closed', () => { kioskWin = null; });
}

// ── Embedded agent lifecycle ────────────────────────────────────────
function bootAgent(cfg) {
  if (stopAgent) {
    try { stopAgent(); } catch (e) { console.warn('[agent] stop failed', e); }
    stopAgent = null;
  }
  try {
    stopAgent = startAgent(
      cfg,
      (ev) => {
        console.log('[agent:event]', ev);
        // Forward selected events to the kiosk window so the UI can
        // show a "last job" pill if/when we add one. Renderer just
        // listens on window.postMessage from us — see below.
        if (kioskWin && !kioskWin.isDestroyed()) {
          kioskWin.webContents.send('agent:event', ev);
        }
      },
      // persist(patch) — the agent calls this when it self-heals a
      // printer IP change or captures the printer's MAC. We merge the
      // patch into the on-disk config so the adopted IP / MAC survives
      // a kiosk restart and the operator never has to re-run setup.
      (patch) => {
        try {
          const current = readConfig() || {};
          writeConfig({ ...current, ...patch });
          console.log('[main] persisted agent config patch:', Object.keys(patch).join(', '));
        } catch (e) {
          console.warn('[main] persist patch failed:', e && e.message);
        }
      },
    );
  } catch (err) {
    console.error('[agent] failed to start:', err && err.message);
  }
}

function stopAgentIfRunning() {
  if (stopAgent) {
    try { stopAgent(); } catch {}
    stopAgent = null;
  }
}

// ── IPC: wizard → main ──────────────────────────────────────────────
ipcMain.handle('setup:getConfig', () => readConfig());

ipcMain.handle('setup:testCloud', async (_e, { baseUrl, kioskKey }) => {
  try {
    const url = normalizeBaseUrl(baseUrl) + '/api/printer/heartbeat';
    const r = await axios.get(url, {
      headers: { 'X-Kiosk-Key': kioskKey },
      timeout: 10_000,
      validateStatus: () => true,
    });
    if (r.status === 200) return { ok: true, message: `Connected. Cloud is online (${r.status}).` };
    if (r.status === 401) return { ok: false, message: 'Cloud rejected the kiosk key (401). Regenerate from the admin and paste again.' };
    return { ok: false, message: `Cloud returned ${r.status}. Check the URL.` };
  } catch (err) {
    return { ok: false, message: `Could not reach cloud: ${err.code || err.message}` };
  }
});

ipcMain.handle('setup:testPrinter', async (_e, cfg) => {
  const port = cfg.transport === 'raw9100' ? (Number(cfg.rawPort) || 9100) : (Number(cfg.printerPort) || 631);
  return await new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok, msg) => {
      if (done) return; done = true;
      try { sock.destroy(); } catch {}
      resolve({ ok, message: msg });
    };
    sock.setTimeout(5_000);
    sock.once('connect', () => finish(true, `Reachable on ${cfg.printerIp}:${port} — printer is awake.`));
    sock.once('timeout', () => finish(false, `Timed out connecting to ${cfg.printerIp}:${port}. Printer asleep?`));
    sock.once('error', (err) => finish(false, `Could not reach ${cfg.printerIp}:${port} — ${err.code || err.message}`));
    sock.connect(port, cfg.printerIp);
  });
});

ipcMain.handle('setup:save', async (_e, cfg) => {
  try {
    // Normalize the URL one more time at the trust boundary, so a
    // bypassed wizard / hand-edited input still lands a clean URL on disk.
    if (cfg && cfg.baseUrl) cfg.baseUrl = normalizeBaseUrl(cfg.baseUrl);
    writeConfig(cfg);

    // Auto-start on login is a per-config preference, not a build-time
    // constant — flip it whenever the wizard saves.
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: cfg.autoStart !== false,
        name: 'PrintLoop Kiosk',
        path: process.execPath,
      });
    }

    // Restart the agent with the new config + open the kiosk window
    // if it wasn't already open. Then close the wizard.
    bootAgent(cfg);
    openKioskWindow();
    if (setupWin && !setupWin.isDestroyed()) setupWin.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err && err.message };
  }
});

ipcMain.handle('setup:discoverPrinters', async () => {
  try {
    console.log('[discover] starting LAN scan + mDNS sweep…');
    const list = await discoverAll({ mdnsTimeoutMs: 2500, enrich: true });
    console.log(`[discover] found ${list.length} printer(s):`,
      list.map((p) => `${p.ip}=${p.model}/${p.transport}`).join(', '));
    return { ok: true, printers: list };
  } catch (err) {
    console.error('[discover] failed:', err && err.message);
    return { ok: false, message: err && err.message, printers: [] };
  }
});

ipcMain.handle('setup:cancel', () => {
  if (setupWin && !setupWin.isDestroyed()) setupWin.close();
  // If we cancelled the first-run wizard and there's no kiosk window
  // (no saved config), there's nothing to fall back to — quit.
  if (!kioskWin && !configIsComplete(readConfig())) {
    app.quit();
  }
});

// ── Second-instance handler ─────────────────────────────────────────
app.on('second-instance', () => {
  const w = kioskWin || setupWin;
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

// ── Boot ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureLogger();
  console.log('[main] app ready, platform=' + process.platform + ' execPath=' + process.execPath);
  // Operator hotkeys are global so they fire even when the kiosk
  // window has focus and Electron has eaten the page's own listeners.
  globalShortcut.register('Control+Shift+S', () => openSetupWindow());
  globalShortcut.register('Control+Shift+Q', () => app.quit());

  const cfg = readConfig();
  console.log('[main] config: baseUrl=' + (cfg && cfg.baseUrl) + ' printerIp=' + (cfg && cfg.printerIp) + ' transport=' + (cfg && cfg.transport) + ' rawPort=' + (cfg && cfg.rawPort) + ' complete=' + configIsComplete(cfg));
  if (!configIsComplete(cfg)) {
    console.log('[main] config incomplete -> opening setup wizard');
    openSetupWindow();
  } else {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: cfg.autoStart !== false,
        name: 'PrintLoop Kiosk',
        path: process.execPath,
      });
    }
    bootAgent(cfg);
    openKioskWindow();
  }
});

app.on('window-all-closed', () => {
  stopAgentIfRunning();
  app.quit();
});

app.on('will-quit', () => {
  stopAgentIfRunning();
  globalShortcut.unregisterAll();
});
