// sprecher — Chat-Backend für Die Hand.
// Sessions + Messages in OrientDB. Chat-Proxy via SSE-Streaming.
// Migriert zu gehirn als API Provider.

const sqlStr = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''").slice(0, 8000)}'`;
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

const GEHIRN_URL = process.env.GEHIRN_URL || 'http://localhost:4000';

export function setupSprecher(app, { odb, dbName, requireAuth }) {
  const sql = (cmd) => odb(`/command/${dbName}/sql`, {
    method: 'POST', body: cmd, headers: { 'Content-Type': 'text/plain' },
  });

  // ── Schema ────────────────────────────────────────────────────────────
  async function ensureSchema() {
    for (const s of [
      'CREATE CLASS SprecherSession IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY SprecherSession.sid        IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherSession.title      IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherSession.model      IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherSession.systemPrompt IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherSession.createdAt  IF NOT EXISTS DATETIME',
      'CREATE PROPERTY SprecherSession.updatedAt  IF NOT EXISTS DATETIME',
      'CREATE INDEX SprecherSession.sid IF NOT EXISTS UNIQUE',
      'CREATE CLASS SprecherMessage IF NOT EXISTS',
      'CREATE PROPERTY SprecherMessage.sid        IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherMessage.role       IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherMessage.content    IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherMessage.type       IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherMessage.model      IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherMessage.imageUrl   IF NOT EXISTS STRING',
      'CREATE PROPERTY SprecherMessage.ts         IF NOT EXISTS DATETIME',
      'CREATE INDEX SprecherMessage.sid IF NOT EXISTS NOTUNIQUE',
    ]) await sql(s);
  }

  // ── Sessions CRUD ─────────────────────────────────────────────────────
  async function listSessions() {
    const r = await sql(`SELECT @rid, sid, title, model, updatedAt FROM SprecherSession ORDER BY updatedAt DESC LIMIT 200`);
    return r.result || [];
  }

  async function getSession(sid) {
    const r = await sql(`SELECT @rid, * FROM SprecherSession WHERE sid = ${sqlStr(sid)} LIMIT 1`);
    return r.result?.[0] || null;
  }

  async function upsertSession({ sid, title, model, systemPrompt }) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const existing = await getSession(sid);
    if (existing) {
      const rid = String(existing['@rid']).replace(/[^0-9:#]/g, '');
      await sql(`UPDATE ${rid} SET title=${sqlStr(title||'')}, model=${sqlStr(model||'')}, updatedAt=${sqlStr(now)}`);
    } else {
      await sql(`INSERT INTO SprecherSession SET sid=${sqlStr(sid)}, title=${sqlStr(title||'Neues Gespräch')}, model=${sqlStr(model||'')}, systemPrompt=${sqlStr(systemPrompt||'')}, createdAt=${sqlStr(now)}, updatedAt=${sqlStr(now)}`);
    }
  }

  async function deleteSession(sid) {
    await sql(`DELETE VERTEX SprecherSession WHERE sid = ${sqlStr(sid)}`);
    await sql(`DELETE FROM SprecherMessage WHERE sid = ${sqlStr(sid)}`);
  }

  async function getMessages(sid) {
    const r = await sql(`SELECT @rid, * FROM SprecherMessage WHERE sid = ${sqlStr(sid)} ORDER BY ts ASC LIMIT 2000`);
    return r.result || [];
  }

  async function appendMessage({ sid, role, content, type, model, imageUrl }) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    await sql(`INSERT INTO SprecherMessage SET sid=${sqlStr(sid)}, role=${sqlStr(role)}, content=${sqlStr(content||'')}, type=${sqlStr(type||'text')}, model=${sqlStr(model||'')}, imageUrl=${sqlStr(imageUrl||'')}, ts=${sqlStr(ts)}`);
    // updatedAt der Session aktualisieren
    await sql(`UPDATE SprecherSession SET updatedAt=${sqlStr(ts.slice(0,19))} WHERE sid=${sqlStr(sid)}`);
  }

  // ── HTTP-Routen ───────────────────────────────────────────────────────
  app.get('/api/sessions', requireAuth(), async (req, res) => {
    try { res.json({ sessions: await listSessions() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/sessions/:sid', requireAuth(), async (req, res) => {
    try {
      const s = await getSession(safeId(req.params.sid));
      if (!s) return res.status(404).json({ error: 'nicht gefunden' });
      const messages = await getMessages(s.sid);
      res.json({ session: s, messages });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/sessions/:sid', requireAuth(), async (req, res) => {
    try {
      await upsertSession({ sid: safeId(req.params.sid), ...req.body });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/sessions/:sid', requireAuth(), async (req, res) => {
    try { await deleteSession(safeId(req.params.sid)); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/sessions/:sid/messages', requireAuth(), async (req, res) => {
    try {
      const { role, content, type, model, imageUrl } = req.body || {};
      await appendMessage({ sid: safeId(req.params.sid), role, content, type, model, imageUrl });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/models', requireAuth(), async (req, res) => {
    try {
      const gRes = await fetch(`${GEHIRN_URL}/models`);
      if (!gRes.ok) throw new Error(`Gehirn models: ${gRes.status}`);
      const data = await gRes.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/video-status/:id', requireAuth(), async (req, res) => {
    try {
      const gRes = await fetch(`${GEHIRN_URL}/gen/video/${req.params.id}`);
      if (!gRes.ok) throw new Error(`Gehirn video status: ${gRes.status}`);
      const data = await gRes.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Streaming-Chat-Endpoint (proxied to gehirn)
  app.post('/api/chat', requireAuth(), async (req, res) => {
    const { sid, model, messages, systemPrompt, imagePrompt, mode, prompt } = req.body || {};
    if (!sid) return res.status(400).json({ error: 'sid erforderlich' });

    // Handle Image Generation (Bild-Modus oder Legacy /image-Kommando)
    if (mode === 'image' || imagePrompt) {
      const activePrompt = imagePrompt || prompt || messages?.[messages.length - 1]?.content;
      if (!activePrompt) return res.status(400).json({ error: 'prompt erforderlich' });
      try {
        const gRes = await fetch(`${GEHIRN_URL}/gen/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: activePrompt, model }),
        });
        if (!gRes.ok) {
          const errData = await gRes.json().catch(() => ({}));
          throw new Error(errData?.error || `Gehirn error: ${gRes.status}`);
        }
        const data = await gRes.json();
        const imageUrl = data.urls?.[0] || '';
        await appendMessage({ sid, role: 'assistant', content: activePrompt, type: 'image', model: data.model, imageUrl });
        return res.json({ type: 'image', imageUrl, model: data.model });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // Handle Video Generation (Video-Modus)
    if (mode === 'video') {
      const activePrompt = prompt || messages?.[messages.length - 1]?.content;
      if (!activePrompt) return res.status(400).json({ error: 'prompt erforderlich' });
      try {
        const gRes = await fetch(`${GEHIRN_URL}/gen/video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: activePrompt, model }),
        });
        if (!gRes.ok) {
          const errData = await gRes.json().catch(() => ({}));
          throw new Error(errData?.error || `Gehirn error: ${gRes.status}`);
        }
        const data = await gRes.json();
        return res.json({ type: 'video', request_id: data.request_id, model: data.model });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // Default: Text Chat (SSE Streaming proxied to gehirn)
    if (!model) return res.status(400).json({ error: 'model erforderlich' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const gRes = await fetch(`${GEHIRN_URL}/gen/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, systemPrompt, stream: true }),
      });
      if (!gRes.ok) {
        const errText = await gRes.text();
        throw new Error(errText || `Gehirn error: ${gRes.status}`);
      }

      const reader = gRes.body.getReader();
      const dec = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);

        // Decode to extract text content for saving in OrientDB
        const chunkText = dec.decode(value, { stream: true });
        const lines = chunkText.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const raw = line.slice(5).trim();
            if (raw && raw !== '[DONE]') {
              try {
                const ev = JSON.parse(raw);
                if (ev.delta) full += ev.delta;
              } catch (e) {}
            }
          }
        }
      }
      await appendMessage({ sid, role: 'assistant', content: full, type: 'text', model });
      res.end();
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  });

  return { ensureSchema };
}
