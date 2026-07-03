// Capture — Roh-Einträge aus der Auge-App (Funkner-Tab).
// Nimmt Text per Bearer-Token entgegen und schreibt Vertex-Klasse `Capture`.
// Klassifizierung/Routing der Einträge folgt später (Gucker/Merker-Pipeline).
//
// Auth: eigener Token (CAPTURE_API_KEY) statt Google-Session, weil die App
// headless im Hintergrund synct — deshalb VOR dem Admin-Gate registrieren.
// Ohne gesetzten Key antworten alle Endpoints mit 503 (Feature aus).
//
// API: POST   /api/capture             { text, timestamp?, clientId? }
//      GET    /api/capture?since=&limit=   Liste inkl. Tombstones + serverTime-Cursor
//      PUT    /api/capture/:clientId   { text, updatedAt }   Last-Write-Wins
//      DELETE /api/capture/:clientId   Soft-Delete (Tombstone)
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
      'CREATE PROPERTY Capture.capturedAt IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Capture.createdAt  IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Capture.updatedAt  IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Capture.deletedAt  IF NOT EXISTS DATETIME',
      'CREATE INDEX Capture.clientId  IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX Capture.createdAt IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX Capture.updatedAt IF NOT EXISTS NOTUNIQUE',
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

  async function findByClientId(clientId) {
    const r = await sql(`SELECT @rid, * FROM Capture WHERE clientId = ${sqlStr(clientId)} LIMIT 1`);
    return r.result?.[0] ?? null;
  }

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
        const dup = await findByClientId(clientId);
        if (dup) return res.json({ record: dup, deduped: true });
      }

      const now = fmtDate(Date.now());
      const record = await odb(`/document/${dbName}`, {
        method: 'POST',
        body: JSON.stringify({
          '@class': 'Capture',
          text,
          clientId,
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

  // Liste für den Pull der App. Tombstones sind absichtlich dabei —
  // nur so propagieren Löschungen. Alt-Records ohne updatedAt zählen
  // mit ihrem createdAt.
  app.get('/api/capture', async (req, res) => {
    try {
      if (rejected(req, res)) return;

      const since = parseDate(req.query.since);
      if (since === null) {
        return res.status(400).json({ error: 'since ist kein gültiges Datum' });
      }
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const where = since ? ` WHERE coalesce(updatedAt, createdAt) >= ${sqlStr(since)}` : '';
      const result = await sql(
        `SELECT @rid, * FROM Capture${where} ORDER BY coalesce(updatedAt, createdAt) LIMIT ${limit}`,
      );
      res.json({ rows: result.result || [], serverTime: fmtDate(Date.now()) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

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

      const current = await findByClientId(clientId);
      if (!current) return res.status(404).json({ error: `kein Capture mit clientId ${clientId}` });

      // Last-Write-Wins: verspätete ältere Edits werden nicht angewendet.
      const currentStamp = current.updatedAt || current.createdAt || '';
      if (updatedAt <= currentStamp) {
        return res.json({ record: current, applied: false });
      }

      await sql(
        `UPDATE Capture SET text = ${sqlStr(text)}, updatedAt = ${sqlStr(updatedAt)} ` +
        `WHERE clientId = ${sqlStr(clientId)}`,
      );
      res.json({ record: await findByClientId(clientId), applied: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  // Soft-Delete. Löschungen gewinnen immer (kein LWW-Vergleich) —
  // ein wiederauferstandener Eintrag wäre verwirrender als ein
  // verlorener später Edit.
  app.delete('/api/capture/:clientId', async (req, res) => {
    try {
      if (rejected(req, res)) return;

      const clientId = String(req.params.clientId).slice(0, 64);
      const current = await findByClientId(clientId);
      if (!current) return res.status(404).json({ error: `kein Capture mit clientId ${clientId}` });

      const now = fmtDate(Date.now());
      await sql(
        `UPDATE Capture SET deletedAt = ${sqlStr(now)}, updatedAt = ${sqlStr(now)} ` +
        `WHERE clientId = ${sqlStr(clientId)}`,
      );
      res.json({ record: await findByClientId(clientId), applied: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  return { ensureSchema };
}
