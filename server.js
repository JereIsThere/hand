import express from 'express';
import path from 'path';
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

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n  🜲  orientdb admin → http://localhost:${PORT}`);
  console.log(`     proxying → ${ORIENTDB_URL}  (db: ${ORIENTDB_DB})\n`);
});
