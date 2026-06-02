// Electron-Hülle für Die Hand.
// Startet den bestehenden Express-Server (server.js) in-process und zeigt die
// Web-Shell in einem nativen Fenster. server.js bleibt unverändert headless
// nutzbar (npm start / docker-compose).
import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Nur eine Instanz erlauben.
if (!app.requestSingleInstanceLock()) { app.quit(); }

// Schreibbares Daten-Verzeichnis.
const dataDir = app.getPath('userData');
fs.mkdirSync(dataDir, { recursive: true });
process.env.HAND_DATA_DIR = dataDir;

// .env laden: bevorzugt userData/.env (gepackt), sonst Projekt-.env (Dev).
for (const p of [path.join(dataDir, '.env'), path.join(projectRoot, '.env')]) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break; }
}

// Update-Channel aus userData/channel.json ('latest' = prod, 'beta' = dev)
const CHANNEL_FILE = path.join(dataDir, 'channel.json');
function readChannel() {
  try { return JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8')).channel || 'latest'; }
  catch { return 'latest'; }
}
function writeChannel(c) {
  fs.writeFileSync(CHANNEL_FILE, JSON.stringify({ channel: c }));
}

let win;
let splash;

// ── Splash-Fenster ────────────────────────────────────────────────────
function createSplash() {
  splash = new BrowserWindow({
    width: 320, height: 380,
    frame: false, resizable: false, alwaysOnTop: true,
    transparent: false, backgroundColor: '#06000e',
    icon: path.join(projectRoot, 'build', 'icon.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    center: true,
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  return splash;
}

function splashStatus(msg) {
  splash?.webContents?.send('splash-status', msg);
}

// ── Hauptfenster ──────────────────────────────────────────────────────
async function createWindow(port) {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    title: 'Die Hand', backgroundColor: '#06000e',
    autoHideMenuBar: true, show: false,
    icon: path.join(projectRoot, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });
  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // F12 / Ctrl+Shift+I → DevTools, Ctrl+R → reload
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F12' || (mod && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools(); event.preventDefault();
    } else if (mod && input.key.toLowerCase() === 'r') {
      win.webContents.reload(); event.preventDefault();
    }
  });

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error(`Laden fehlgeschlagen (${code}): ${desc}`);
    splash?.close(); splash = null;
    win.show();
    win.webContents.openDevTools({ mode: 'detach' });
  });

  win.once('ready-to-show', () => {
    splash?.close(); splash = null;
    win.show();
  });

  await win.loadURL(`http://127.0.0.1:${port}`);
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

// ── Auto-Updater ──────────────────────────────────────────────────────
function setupUpdater() {
  const channel = readChannel();
  autoUpdater.channel = channel;
  autoUpdater.allowDowngrade = channel === 'beta';
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send('update-status', { status: 'available', version: info.version, channel });
  });
  autoUpdater.on('download-progress', (p) => {
    win?.webContents.send('update-status', { status: 'downloading', percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    win?.webContents.send('update-status', { status: 'ready', version: info.version });
  });
  autoUpdater.on('error', (e) => {
    win?.webContents.send('update-status', { status: 'error', message: e.message });
  });

  ipcMain.on('update-install-now', () => autoUpdater.quitAndInstall(false, true));

  // Channel-Switch: speichert + neustart-Hinweis
  ipcMain.on('update-set-channel', (e, c) => {
    const ch = c === 'beta' ? 'beta' : 'latest';
    writeChannel(ch);
    autoUpdater.channel = ch;
    autoUpdater.checkForUpdates().catch(() => {});
    win?.webContents.send('update-status', { status: 'channel-changed', channel: ch });
  });

  ipcMain.handle('update-get-channel', () => readChannel());

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

app.whenReady().then(async () => {
  createSplash();

  let port = 3737;
  try {
    splashStatus('server.js wird geladen…');
    const { startServer } = await import(pathToFileURL(path.join(projectRoot, 'server.js')).href);
    splashStatus('server startet…');
    ({ port } = await startServer());
    splashStatus('bereit ✓');
  } catch (e) {
    console.error('Server-Start fehlgeschlagen:', e);
    splashStatus('fehler beim starten — F12 für Details');
  }

  await createWindow(port);
  if (app.isPackaged) setupUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => { app.quit(); });
