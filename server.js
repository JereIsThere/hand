import express from 'express';
import path from 'path';
import net from 'net';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.text({ limit: '4mb', type: ['text/plain', 'application/sql'] }));

const {
  ORIENTDB_URL = 'http://localhost:2480',
  ORIENTDB_USER = 'root',
  ORIENTDB_PASS = '',
  ORIENTDB_DB = 'mydb',
  PORT = 3737,
  SSH_HOST = '',
  SSH_USER = '',
  SSH_PORT = '22',
  SSH_LOCAL_PORT = '2480',
  SSH_REMOTE_HOST = 'localhost',
  SSH_REMOTE_PORT = '2480',
} = process.env;

const auth = 'Basic ' + Buffer.from(`${ORIENTDB_USER}:${ORIENTDB_PASS}`).toString('base64');

async function odb(suffix, init = {}) {
  const url = `${ORIENTDB_URL}${suffix}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(
      `OrientDB ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data).slice(0, 400)}`
    );
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

const safeRid = (rid) => String(rid).replace(/^#/, '').replace(/[^0-9:]/g, '');
const safeIdent = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '');
const safeId    = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '');

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) {
    res.status(e.status || 500).json({ error: e.message, payload: e.payload });
  }
};

// ============================================================
// OrientDB endpoints
// ============================================================
app.get('/api/info', wrap(async () => {
  const info = await odb(`/database/${ORIENTDB_DB}`);
  return { db: ORIENTDB_DB, url: ORIENTDB_URL, server: info.server, classes: info.classes?.length || 0 };
}));

app.get('/api/classes', wrap(async () => {
  const info = await odb(`/database/${ORIENTDB_DB}`);
  return info.classes || [];
}));

app.get('/api/records', wrap(async (req) => {
  const cls = safeIdent(req.query.class || '');
  if (!cls) throw Object.assign(new Error('class required'), { status: 400 });
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const order = req.query.order ? ` ORDER BY \`${safeIdent(req.query.order)}\`` : '';
  const sql = `SELECT FROM \`${cls}\`${order} SKIP ${skip} LIMIT ${limit}`;
  const result = await odb(`/command/${ORIENTDB_DB}/sql`, {
    method: 'POST',
    body: sql,
    headers: { 'Content-Type': 'text/plain' },
  });
  return { rows: result.result || [], sql };
}));

app.get('/api/count', wrap(async (req) => {
  const cls = safeIdent(req.query.class || '');
  if (!cls) throw Object.assign(new Error('class required'), { status: 400 });
  const result = await odb(`/command/${ORIENTDB_DB}/sql`, {
    method: 'POST',
    body: `SELECT count(*) AS c FROM \`${cls}\``,
    headers: { 'Content-Type': 'text/plain' },
  });
  return { count: result.result?.[0]?.c ?? 0 };
}));

app.get('/api/record/:rid', wrap(async (req) => {
  return await odb(`/document/${ORIENTDB_DB}/${safeRid(req.params.rid)}`);
}));

app.post('/api/record', wrap(async (req) => {
  const doc = req.body || {};
  if (!doc['@class'] || !safeIdent(doc['@class'])) {
    throw Object.assign(new Error('@class (gültiger Identifier) erforderlich'), { status: 400 });
  }
  return await odb(`/document/${ORIENTDB_DB}`, {
    method: 'POST',
    body: JSON.stringify(doc),
  });
}));

app.put('/api/record/:rid', wrap(async (req) => {
  const rid = safeRid(req.params.rid);
  return await odb(`/document/${ORIENTDB_DB}/${rid}`, {
    method: 'PUT',
    body: JSON.stringify(req.body),
  });
}));

app.delete('/api/record/:rid', wrap(async (req) => {
  const rid = safeRid(req.params.rid);
  await odb(`/document/${ORIENTDB_DB}/${rid}`, { method: 'DELETE' });
  return { deleted: true, rid: `#${rid}` };
}));

app.post('/api/query', wrap(async (req) => {
  const { command, language = 'sql' } = req.body || {};
  if (!command || typeof command !== 'string') {
    throw Object.assign(new Error('command (string) required'), { status: 400 });
  }
  const lang = safeIdent(language) || 'sql';
  const result = await odb(`/command/${ORIENTDB_DB}/${lang}`, {
    method: 'POST',
    body: command,
    headers: { 'Content-Type': 'text/plain' },
  });
  return { rows: result.result ?? result, raw: result };
}));

// ============================================================
// Tunnel manager
// ============================================================
const TUNNELS_FILE = path.join(__dirname, 'tunnels.json');
const LOG_TAIL = 80;

function probePort(host, port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: timeoutMs }, () => {
      s.end(); resolve(true);
    });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

async function waitForPort(host, port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probePort(host, port)) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

class Tunnel {
  constructor(def, { managed = false } = {}) {
    this.def = def;            // { id, name, host, user, port, localPort, remoteHost, remotePort }
    this.managed = managed;    // true = from .env (read-only, cannot delete)
    this.child = null;
    this.status = 'stopped';   // stopped | starting | running | error
    this.error = null;
    this.log = [];
  }

  toJSON() {
    return {
      id: this.def.id,
      name: this.def.name,
      managed: this.managed,
      host: this.def.host,
      user: this.def.user,
      port: this.def.port,
      localPort: this.def.localPort,
      remoteHost: this.def.remoteHost,
      remotePort: this.def.remotePort,
      status: this.status,
      error: this.error,
    };
  }

  _appendLog(line) {
    this.log.push(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
    if (this.log.length > LOG_TAIL) this.log = this.log.slice(-LOG_TAIL);
  }

  async start() {
    if (this.status === 'running' || this.status === 'starting') return;
    const { host, user, port, localPort, remoteHost, remotePort } = this.def;
    if (!host) throw new Error('host fehlt');

    if (await probePort('127.0.0.1', localPort)) {
      this._appendLog(`Port ${localPort} bereits belegt — spawn übersprungen.`);
      this.status = 'running';
      this.error = null;
      return;
    }

    this.status = 'starting';
    this.error = null;
    const target = user ? `${user}@${host}` : host;
    const args = [
      '-N', '-T',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-p', String(port || 22),
      '-L', `${localPort}:${remoteHost || 'localhost'}:${remotePort}`,
      target,
    ];
    this._appendLog(`spawn ssh ${args.join(' ')}`);

    const child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;

    const onData = (buf) => {
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (line.trim()) this._appendLog(line);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.on('exit', (code, sig) => {
      this.child = null;
      if (this.status === 'starting' || this.status === 'running') {
        this.status = 'error';
        this.error = `ssh beendet (code=${code}, sig=${sig})`;
        this._appendLog(this.error);
      }
    });

    const ready = await waitForPort('127.0.0.1', localPort, 10000);
    if (!ready) {
      try { child.kill(); } catch {}
      this.status = 'error';
      this.error = `Tunnel kam in 10s nicht hoch (Key beim Ziel? Host erreichbar? Port frei?)`;
      this._appendLog(this.error);
      throw new Error(this.error);
    }
    this.status = 'running';
    this._appendLog(`live auf localhost:${localPort}`);
  }

  stop() {
    if (this.child) {
      try { this.child.kill(); } catch {}
      this._appendLog('kill signal gesendet');
    }
    this.child = null;
    this.status = 'stopped';
    this.error = null;
  }
}

class TunnelManager {
  constructor() {
    this.tunnels = new Map();
    this._loadManaged();
    this._loadPersisted();
  }

  _loadManaged() {
    if (SSH_HOST) {
      this.tunnels.set('orientdb', new Tunnel({
        id: 'orientdb',
        name: 'OrientDB',
        host: SSH_HOST,
        user: SSH_USER || undefined,
        port: Number(SSH_PORT),
        localPort: Number(SSH_LOCAL_PORT),
        remoteHost: SSH_REMOTE_HOST,
        remotePort: Number(SSH_REMOTE_PORT),
      }, { managed: true }));
    }
  }

  _loadPersisted() {
    if (!fs.existsSync(TUNNELS_FILE)) return;
    try {
      const list = JSON.parse(fs.readFileSync(TUNNELS_FILE, 'utf8'));
      for (const def of list) {
        if (!def?.id || this.tunnels.has(def.id)) continue;
        this.tunnels.set(def.id, new Tunnel(def, { managed: false }));
      }
    } catch (e) {
      console.error(`  ! tunnels.json kaputt: ${e.message} — wird ignoriert`);
    }
  }

  _persist() {
    const list = [...this.tunnels.values()]
      .filter(t => !t.managed)
      .map(t => t.def);
    fs.writeFileSync(TUNNELS_FILE, JSON.stringify(list, null, 2));
  }

  list() {
    return [...this.tunnels.values()].map(t => t.toJSON());
  }

  get(id) {
    const t = this.tunnels.get(id);
    if (!t) throw Object.assign(new Error(`Tunnel "${id}" unbekannt`), { status: 404 });
    return t;
  }

  create(def) {
    const id = safeId(def.id || def.name || '').toLowerCase();
    if (!id) throw Object.assign(new Error('id oder name erforderlich'), { status: 400 });
    if (this.tunnels.has(id)) throw Object.assign(new Error(`id "${id}" existiert bereits`), { status: 409 });
    if (!def.host || !def.localPort || !def.remotePort) {
      throw Object.assign(new Error('host, localPort, remotePort sind Pflicht'), { status: 400 });
    }
    const full = {
      id,
      name: def.name || id,
      host: String(def.host),
      user: def.user ? String(def.user) : undefined,
      port: Number(def.port || 22),
      localPort: Number(def.localPort),
      remoteHost: String(def.remoteHost || 'localhost'),
      remotePort: Number(def.remotePort),
    };
    const t = new Tunnel(full, { managed: false });
    this.tunnels.set(id, t);
    this._persist();
    return t;
  }

  update(id, patch) {
    const t = this.get(id);
    if (t.managed) throw Object.assign(new Error('managed Tunnel (aus .env) kann nur über .env geändert werden'), { status: 400 });
    if (t.status === 'running' || t.status === 'starting') {
      throw Object.assign(new Error('erst stoppen, dann ändern'), { status: 409 });
    }
    Object.assign(t.def, {
      name: patch.name ?? t.def.name,
      host: patch.host ?? t.def.host,
      user: patch.user ?? t.def.user,
      port: patch.port != null ? Number(patch.port) : t.def.port,
      localPort: patch.localPort != null ? Number(patch.localPort) : t.def.localPort,
      remoteHost: patch.remoteHost ?? t.def.remoteHost,
      remotePort: patch.remotePort != null ? Number(patch.remotePort) : t.def.remotePort,
    });
    this._persist();
    return t;
  }

  remove(id) {
    const t = this.get(id);
    if (t.managed) throw Object.assign(new Error('managed Tunnel kann nicht gelöscht werden'), { status: 400 });
    t.stop();
    this.tunnels.delete(id);
    this._persist();
  }

  killAll() {
    for (const t of this.tunnels.values()) t.stop();
  }
}

const tunnels = new TunnelManager();

app.get('/api/tunnels', wrap(async () => tunnels.list()));

app.post('/api/tunnels', wrap(async (req) => {
  return tunnels.create(req.body || {}).toJSON();
}));

app.put('/api/tunnels/:id', wrap(async (req) => {
  return tunnels.update(safeId(req.params.id), req.body || {}).toJSON();
}));

app.delete('/api/tunnels/:id', wrap(async (req) => {
  tunnels.remove(safeId(req.params.id));
  return { deleted: true };
}));

app.post('/api/tunnels/:id/start', wrap(async (req) => {
  const t = tunnels.get(safeId(req.params.id));
  await t.start();
  return t.toJSON();
}));

app.post('/api/tunnels/:id/stop', wrap(async (req) => {
  const t = tunnels.get(safeId(req.params.id));
  t.stop();
  return t.toJSON();
}));

app.get('/api/tunnels/:id/log', wrap(async (req) => {
  return { log: tunnels.get(safeId(req.params.id)).log };
}));

// ============================================================
// static + lifecycle
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${sig} — fahre runter ...`);
  tunnels.killAll();
  process.exit(0);
}
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(s => process.on(s, () => shutdown(s)));

async function main() {
  // Auto-start des managed (OrientDB) Tunnels, wenn konfiguriert.
  // Schlägt fehl -> nur loggen, der Tunnel-Tab kann ihn neu starten.
  const odbTunnel = tunnels.tunnels.get('orientdb');
  if (odbTunnel) {
    try { await odbTunnel.start(); }
    catch (e) { console.error(`  ! OrientDB-Tunnel Auto-Start: ${e.message}\n`); }
  }

  app.listen(PORT, () => {
    console.log(`  hand  -> http://localhost:${PORT}`);
    console.log(`        OrientDB-Proxy -> ${ORIENTDB_URL}  (db: ${ORIENTDB_DB})`);
    console.log(`        Tunnels: ${tunnels.list().length} konfiguriert\n`);
  });
}

main();
