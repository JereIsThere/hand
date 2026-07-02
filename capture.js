// Capture — Roh-Einträge aus der Auge-App (Funkner-Tab).
// Nimmt Text per Bearer-Token entgegen und schreibt Vertex-Klasse `Capture`.
// Klassifizierung/Routing der Einträge folgt später (Gucker/Merker-Pipeline).
//
// Auth: eigener Token (CAPTURE_API_KEY) statt Google-Session, weil die App
// headless im Hintergrund synct — deshalb VOR dem Admin-Gate registrieren.
// Ohne gesetzten Key antwortet der Endpoint mit 503 (Feature aus).
//
// API: POST /api/capture   { text, timestamp?, clientId? }
//      clientId (UUID der App) macht Outbox-Retries idempotent: gleicher
//      clientId -> vorhandener Record kommt zurück statt Duplikat.

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
      'CREATE INDEX Capture.clientId  IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX Capture.createdAt IF NOT EXISTS NOTUNIQUE',
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

  app.post('/api/capture', async (req, res) => {
    try {
      if (!apiKey()) {
        return res.status(503).json({ error: 'Capture aus — CAPTURE_API_KEY nicht gesetzt' });
      }
      if (!validBearer(req)) {
        return res.status(401).json({ error: 'Bearer-Token fehlt oder ist falsch' });
      }

      const b = req.body || {};
      const text = String(b.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: 'text (string, nicht leer) ist Pflicht' });
      }

      // timestamp: ISO-String oder Unix-ms — Zeitpunkt der Erfassung in der App.
      let capturedAt = fmtDate(Date.now());
      if (b.timestamp != null) {
        const t = new Date(b.timestamp);
        if (isNaN(t)) return res.status(400).json({ error: 'timestamp ist kein gültiges Datum' });
        capturedAt = fmtDate(t);
      }

      const clientId = b.clientId ? String(b.clientId).slice(0, 64) : null;
      if (clientId) {
        const dup = await sql(`SELECT @rid, * FROM Capture WHERE clientId = ${sqlStr(clientId)} LIMIT 1`);
        if (dup.result?.length) {
          return res.json({ record: dup.result[0], deduped: true });
        }
      }

      const record = await odb(`/document/${dbName}`, {
        method: 'POST',
        body: JSON.stringify({
          '@class': 'Capture',
          text,
          clientId,
          capturedAt,
          createdAt: fmtDate(Date.now()),
        }),
      });
      res.status(201).json({ record, deduped: false });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, payload: e.payload });
    }
  });

  return { ensureSchema };
}
