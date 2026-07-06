// Capture — Roh-Einträge aus der Auge-App (Funkner-Tab).
// Nimmt Text per Bearer-Token entgegen und schreibt Vertex-Klasse `Capture`.
// Chats/Projekte (Vertex `CaptureChat`) gruppieren Einträge; die spätere
// Klassifizierungs-Pipeline (Gucker/Merker) kann tags + chatId befüllen.
//
// Auth: eigener Token (CAPTURE_API_KEY) statt Google-Session, weil die App
// headless im Hintergrund synct — deshalb VOR dem Admin-Gate registrieren.
// Ohne gesetzten Key antworten alle Endpoints mit 503 (Feature aus).
//
// API (Einträge):
//   POST   /api/capture             { text, timestamp?, clientId?, chatId?, sender? }
//   GET    /api/capture?since=&limit=       Liste inkl. Tombstones + serverTime
//   PUT    /api/capture/:clientId   { text, updatedAt, chatId? }   LWW
//   DELETE /api/capture/:clientId   Soft-Delete (Tombstone)
// API (Chats/Projekte — Routen sind VOR /:clientId registriert!):
//   POST   /api/capture/chats       { clientId, title, kind?, timestamp? }
//   GET    /api/capture/chats?since=&limit=
//   PUT    /api/capture/chats/:clientId   { title?, kind?, updatedAt }   LWW
//   DELETE /api/capture/chats/:clientId   Soft-Delete (Tombstone)
//
// Sync-Semantik (Solo-System, Geräte desselben Users):
//   - clientId (UUID der App) macht Retries idempotent
//   - Edits: Last-Write-Wins über updatedAt — der neuere Stand gewinnt,
//     verspätete ältere Schreiber kriegen applied:false + aktuellen Record
//   - Löschen: Tombstone (deletedAt), damit die Löschung per Pull auf
//     andere Geräte propagiert. Löschungen gewinnen immer.
//   - GET liefert Tombstones MIT, sortiert nach updatedAt; serverTime in
//     der Antwort ist der Cursor für den nächsten ?since=-Pull (Client-
//     Uhren spielen damit keine Rolle).

import { timingSafeEqual } from 'crypto';

const sqlStr = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''")}'`;

const CHAT_KINDS = ['chat', 'projekt'];
const ENTRY_SENDERS = ['user', 'ai'];

export function setupCapture(app, { odb, dbName }) {
  const sql = (cmd) => odb(`/command/${dbName}/sql`, {
    method: 'POST', body: cmd, headers: { 'Content-Type': 'text/plain' },
  });

  // Lazy lesen — der Key kann auch erst per Vault-loadIntoEnv() auftauchen.
  const apiKey = () => process.env.CAPTURE_API_KEY || '';

  async function ensureSchema() {
    for (const s of [
      'CREATE CLASS Capture IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY Capture.text       IF NOT EXISTS STRING',
      'CREATE PROPERTY Capture.clientId   IF NOT EXISTS STRING',
      'CREATE PROPERTY Capture.chatId     IF NOT EXISTS STRING',
      // 'user' (Default) | 'ai' — Antwort von gehirn via Funkners "An Modell
      // senden". Reine Durchreiche, hand klassifiziert/interpretiert nicht.
      'CREATE PROPERTY Capture.sender     IF NOT EXISTS STRING',
      'CREATE PROPERTY Capture.capturedAt IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Capture.createdAt  IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Capture.updatedAt  IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Capture.deletedAt  IF NOT EXISTS DATETIME',
      'CREATE INDEX Capture.clientId  IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX Capture.chatId    IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX Capture.createdAt IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX Capture.updatedAt IF NOT EXISTS NOTUNIQUE',
      'CREATE CLASS CaptureChat IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY CaptureChat.clientId  IF NOT EXISTS STRING',
      'CREATE PROPERTY CaptureChat.title     IF NOT EXISTS STRING',
      'CREATE PROPERTY CaptureChat.kind      IF NOT EXISTS STRING',
      'CREATE PROPERTY CaptureChat.createdAt IF NOT EXISTS DATETIME',
      'CREATE PROPERTY CaptureChat.updatedAt IF NOT EXISTS DATETIME',
      'CREATE PROPERTY CaptureChat.deletedAt IF NOT EXISTS DATETIME',
      'CREATE INDEX CaptureChat.clientId  IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX CaptureChat.updatedAt IF NOT EXISTS NOTUNIQUE',
    ]) await sql(s);
  }

  function validBearer(req) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(apiKey());
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const fmtDate = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);

  // 503/401-Gate für alle Capture-Routen; gibt true zurück wenn abgelehnt.
  function rejected(req, res) {
    if (!apiKey()) {
      res.status(503).json({ error: 'Capture aus — CAPTURE_API_KEY nicht gesetzt' });
      return true;
    }
    if (!validBearer(req)) {
      res.status(401).json({ error: 'Bearer-Token fehlt oder ist falsch' });
      return true;
    }
    return false;
  }

  // Datum aus Request (ISO-String oder Unix-ms) → 'YYYY-MM-DD HH:MM:SS' | null
  function parseDate(v) {
    if (v == null) return undefined;
    const t = new Date(v);
    return isNaN(t) ? null : fmtDate(t);
  }

  async function findByClientId(cls, clientId) {
    const r = await sql(`SELECT @rid, * FROM ${cls} WHERE clientId = ${sqlStr(clientId)} LIMIT 1`);
    return r.result?.[0] ?? null;
  }

  // GET-Handler für beide Klassen: ?since=&limit=, inkl. Tombstones.
  function listHandler(cls) {
    return async (req, res) => {
      try {
        if (rejected(req, res)) return;
        const since = parseDate(req.query.since);
        if (since === null) {
          return res.status(400).json({ error: 'since ist kein gültiges Datum' });
        }
        const limit = Math.min(Number(req.query.limit) || 200, 500);
        const where = since ? ` WHERE coalesce(updatedAt, createdAt) >= ${sqlStr(since)}` : '';
        const result = await sql(
          `SELECT @rid, * FROM ${cls}${where} ORDER BY coalesce(updatedAt, createdAt) LIMIT ${limit}`,
        );
        res.json({ rows: result.result || [], serverTime: fmtDate(Date.now()) });
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message, payload: e.payload });
      }
    };
  }

  // Soft-Delete-Handler für beide Klassen. Löschungen gewinnen immer.
  function deleteHandler(cls) {
    return async (req, res) => {
      try {
        if (rejected(req, res)) return;
        const clientId = String(req.params.clientId).slice(0, 64);
        const current = await findByClientId(cls, clientId);
        if (!current) return res.status(404).json({ error: `kein ${cls} mit clientId ${clientId}` });
        const now = fmtDate(Date.now());
        await sql(
          `UPDATE ${cls} SET deletedAt = ${sqlStr(now)}, updatedAt = ${sqlStr(now)} ` +
          `WHERE clientId = ${sqlStr(clientId)}`,
        );
        res.json({ record: await findByClientId(cls, clientId), applied: true });
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message, payload: e.payload });
      }
    };
  }

  // ── Chats/Projekte — VOR den /:clientId-Routen registrieren, sonst
  //    würde Express "chats" als clientId-Parameter matchen. ──────────

  app.post('/api/capture/chats', async (req, res) => {
    try {
      if (rejected(req, res)) return;
      const b = req.body || {};
      const clientId = b.clientId ? String(b.clientId).slice(0, 64) : null;
      const title = String(b.title || '').trim();
      if (!clientId) return res.status(400).json({ error: 'clientId ist Pflicht' });
      if (!title) return res.status(400).json({ error: 'title (string, nicht leer) ist Pflicht' });
      const kind = CHAT_KINDS.includes(b.kind) ? b.kind : 'chat';

      const dup = await findByClientId('CaptureChat', clientId);
      if (dup) return res.json({ record: dup, deduped: true });

      const createdAt = parseDate(b.timestamp) ?? fmtDate(Date.now());
      if (createdAt === null) {
        return res.status(400).json({ error: 'timestamp ist kein gültiges Datum' });
      }
      const record = await odb(`/document/${dbName}`, {
        method: 'POST',
        body: JSON.stringify({
          '@class': 'CaptureChat',
          clientId,
          title,
          kind,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        }),
      });
      res.status(201).json({ record, deduped: false });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  app.get('/api/capture/chats', listHandler('CaptureChat'));

  app.put('/api/capture/chats/:clientId', async (req, res) => {
    try {
      if (rejected(req, res)) return;
      const clientId = String(req.params.clientId).slice(0, 64);
      const b = req.body || {};
      const title = b.title != null ? String(b.title).trim() : null;
      const kind = b.kind != null && CHAT_KINDS.includes(b.kind) ? b.kind : null;
      if (!title && !kind) {
        return res.status(400).json({ error: 'title oder kind ist Pflicht' });
      }
      const updatedAt = parseDate(b.updatedAt) ?? fmtDate(Date.now());
      if (updatedAt === null) {
        return res.status(400).json({ error: 'updatedAt ist kein gültiges Datum' });
      }

      const current = await findByClientId('CaptureChat', clientId);
      if (!current) return res.status(404).json({ error: `kein CaptureChat mit clientId ${clientId}` });

      const currentStamp = current.updatedAt || current.createdAt || '';
      if (updatedAt <= currentStamp) {
        return res.json({ record: current, applied: false });
      }

      const sets = [`updatedAt = ${sqlStr(updatedAt)}`];
      if (title) sets.push(`title = ${sqlStr(title)}`);
      if (kind) sets.push(`kind = ${sqlStr(kind)}`);
      await sql(`UPDATE CaptureChat SET ${sets.join(', ')} WHERE clientId = ${sqlStr(clientId)}`);
      res.json({ record: await findByClientId('CaptureChat', clientId), applied: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  app.delete('/api/capture/chats/:clientId', deleteHandler('CaptureChat'));

  // ── Einträge ─────────────────────────────────────────────────────────

  app.post('/api/capture', async (req, res) => {
    try {
      if (rejected(req, res)) return;

      const b = req.body || {};
      const text = String(b.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: 'text (string, nicht leer) ist Pflicht' });
      }

      const capturedAt = parseDate(b.timestamp) ?? undefined;
      if (capturedAt === null) {
        return res.status(400).json({ error: 'timestamp ist kein gültiges Datum' });
      }

      const clientId = b.clientId ? String(b.clientId).slice(0, 64) : null;
      if (clientId) {
        const dup = await findByClientId('Capture', clientId);
        if (dup) return res.json({ record: dup, deduped: true });
      }

      const now = fmtDate(Date.now());
      const sender = ENTRY_SENDERS.includes(b.sender) ? b.sender : 'user';
      const record = await odb(`/document/${dbName}`, {
        method: 'POST',
        body: JSON.stringify({
          '@class': 'Capture',
          text,
          clientId,
          chatId: b.chatId ? String(b.chatId).slice(0, 64) : null,
          sender,
          capturedAt: capturedAt ?? now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
      });
      res.status(201).json({ record, deduped: false });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  app.get('/api/capture', listHandler('Capture'));

  app.put('/api/capture/:clientId', async (req, res) => {
    try {
      if (rejected(req, res)) return;

      const clientId = String(req.params.clientId).slice(0, 64);
      const b = req.body || {};
      const text = String(b.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: 'text (string, nicht leer) ist Pflicht' });
      }
      const updatedAt = parseDate(b.updatedAt) ?? fmtDate(Date.now());
      if (updatedAt === null) {
        return res.status(400).json({ error: 'updatedAt ist kein gültiges Datum' });
      }

      const current = await findByClientId('Capture', clientId);
      if (!current) return res.status(404).json({ error: `kein Capture mit clientId ${clientId}` });

      // Last-Write-Wins: verspätete ältere Edits werden nicht angewendet.
      const currentStamp = current.updatedAt || current.createdAt || '';
      if (updatedAt <= currentStamp) {
        return res.json({ record: current, applied: false });
      }

      const sets = [`text = ${sqlStr(text)}`, `updatedAt = ${sqlStr(updatedAt)}`];
      if (b.chatId !== undefined) {
        sets.push(`chatId = ${b.chatId ? sqlStr(String(b.chatId).slice(0, 64)) : 'null'}`);
      }
      await sql(`UPDATE Capture SET ${sets.join(', ')} WHERE clientId = ${sqlStr(clientId)}`);
      res.json({ record: await findByClientId('Capture', clientId), applied: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  app.delete('/api/capture/:clientId', deleteHandler('Capture'));

  return { ensureSchema };
}
