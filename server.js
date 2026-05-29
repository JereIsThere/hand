import express from 'express';
import path from 'path';
import net from 'net';
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

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) {
    res.status(e.status || 500).json({ error: e.message, payload: e.payload });
  }
};

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

app.use(express.static(path.join(__dirname, 'public')));

// --- SSH-Tunnel ---------------------------------------------------------
let sshChild = null;
let shuttingDown = false;

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

async function startTunnel() {
  const target = SSH_USER ? `${SSH_USER}@${SSH_HOST}` : SSH_HOST;
  const localPort = Number(SSH_LOCAL_PORT);
  const remote = `${SSH_REMOTE_HOST}:${SSH_REMOTE_PORT}`;

  if (await probePort('127.0.0.1', localPort)) {
    console.log(`  ↪ Port ${localPort} schon offen — überspringe Tunnel (vermutlich manuell schon getunnelt).`);
    return null;
  }

  const args = [
    '-N', '-T',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'BatchMode=yes',          // niemals prompten — Key oder Fehler
    '-o', 'StrictHostKeyChecking=accept-new',
    '-p', String(SSH_PORT),
    '-L', `${localPort}:${remote}`,
    target,
  ];
  console.log(`  🔐 SSH-Tunnel  ${target}:${SSH_PORT}  →  localhost:${localPort} → ${remote}`);
  const child = spawn('ssh', args, { stdio: ['ignore', 'inherit', 'inherit'] });

  child.on('exit', (code, sig) => {
    sshChild = null;
    if (!shuttingDown) {
      console.error(`  ✗ SSH-Tunnel beendet (code=${code}, sig=${sig}). Server fährt runter.`);
      process.exit(1);
    }
  });

  const ready = await waitForPort('127.0.0.1', localPort, 10000);
  if (!ready) {
    child.kill();
    throw new Error(
      `SSH-Tunnel auf Port ${localPort} kam in 10s nicht hoch. ` +
      `Checks: ssh-Key für ${target} hinterlegt? Host erreichbar? Port ${localPort} frei?`
    );
  }
  console.log(`  ✓ Tunnel live auf localhost:${localPort}\n`);
  return child;
}

function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ⤴ ${sig} — fahre runter…`);
  if (sshChild) try { sshChild.kill(); } catch {}
  process.exit(0);
}
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(s => process.on(s, () => shutdown(s)));

async function main() {
  if (SSH_HOST) {
    try { sshChild = await startTunnel(); }
    catch (e) {
      console.error(`  ✗ ${e.message}\n`);
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    console.log(`  🜲  orientdb admin → http://localhost:${PORT}`);
    console.log(`     proxying → ${ORIENTDB_URL}  (db: ${ORIENTDB_DB})\n`);
  });
}

main();
