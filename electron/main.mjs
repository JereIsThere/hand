// Electron-Hülle für Die Hand.
// Startet den bestehenden Express-Server (server.js) in-process und zeigt die
// Web-Shell in einem nativen Fenster. server.js bleibt unverändert headless
// nutzbar (npm start / docker-compose).
import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Nur eine Instanz erlauben.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Schreibbares Daten-Verzeichnis. Der App-Ordner (asar) ist read-only, daher
// landen tunnels.json + .env in userData.
const dataDir = app.getPath('userData');
fs.mkdirSync(dataDir, { recursive: true });
process.env.HAND_DATA_DIR = dataDir;

// .env laden: bevorzugt userData/.env (gepackt), sonst Projekt-.env (Dev).
for (const p of [path.join(dataDir, '.env'), path.join(projectRoot, '.env')]) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break; }
}

let win;

async function createWindow(port) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Die Hand',
    backgroundColor: '#06000e',
    autoHideMenuBar: true,
    icon: path.join(projectRoot, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);

  // Externe Links (z.B. die eingebetteten Tools im neuen Tab) im echten Browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(`http://127.0.0.1:${port}`);
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(async () => {
  let port = 3737;
  try {
    const { startServer } = await import(pathToFileURL(path.join(projectRoot, 'server.js')).href);
    ({ port } = await startServer());
  } catch (e) {
    console.error('Server-Start fehlgeschlagen:', e);
  }
  await createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
