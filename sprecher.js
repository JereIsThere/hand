// sprecher — Chat-Backend für Die Hand.
// Sessions + Messages in OrientDB. Chat-Proxy via SSE-Streaming.
// Unterstützte Provider: Anthropic (Claude) + xAI (Grok).
// Slash-Kommandos /image → N8N_IMAGE_WEBHOOK (n8n übernimmt Flux/DALL-E).

const sqlStr = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''").slice(0, 8000)}'`;
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

export const MODELS = [
  { id: 'claude-sonnet-4-6',  label: 'Claude Sonnet 4.6',  provider: 'anthropic', fast: true },
  { id: 'claude-opus-4-8',    label: 'Claude Opus 4.8',    provider: 'anthropic', smart: true },
  { id: 'claude-haiku-4-5',   label: 'Claude Haiku 4.5',   provider: 'anthropic', cheap: true },
  { id: 'grok-3',             label: 'Grok 3',             provider: 'xai', smart: true },
  { id: 'grok-3-mini',        label: 'Grok 3 Mini',        provider: 'xai', fast: true },
  { id: 'grok-3-fast',        label: 'Grok 3 Fast',        provider: 'xai' },
];

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
      await sql(`INSERT INTO SprecherSession SET sid=${sqlStr(sid)}, title=${sqlStr(title||'Neues Gespräch')}, model=${sqlStr(model||'claude-sonnet-4-6')}, systemPrompt=${sqlStr(systemPrompt||'')}, createdAt=${sqlStr(now)}, updatedAt=${sqlStr(now)}`);
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

  // ── Chat-Proxy: Streaming SSE ─────────────────────────────────────────
  async function streamAnthropic({ model, messages, systemPrompt, res }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

    const apiMsgs = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content || '' }],
    })).filter(m => m.content.length);

    const body = {
      model,
      max_tokens: 8192,
      stream: true,
      messages: apiMsgs,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    };

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!upstream.ok) {
      const err = await upstream.text();
      throw new Error(`Anthropic ${upstream.status}: ${err.slice(0, 200)}`);
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let full = '';
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const ev = JSON.parse(data);
          const delta = ev.delta?.text || ev.delta?.value || '';
          if (delta) {
            full += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {}
      }
    }
    return full;
  }

  async function streamXai({ model, messages, systemPrompt, res }) {
    const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) throw new Error('GROK_API_KEY nicht gesetzt — im Vault anlegen');

    const apiMsgs = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || '',
      })),
    ];

    const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages: apiMsgs, stream: true, max_tokens: 8192 }),
    });
    if (!upstream.ok) {
      const err = await upstream.text();
      throw new Error(`xAI ${upstream.status}: ${err.slice(0, 200)}`);
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let full = '';
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const ev = JSON.parse(data);
          const delta = ev.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {}
      }
    }
    return full;
  }

  // ── /image via n8n ────────────────────────────────────────────────────
  async function requestImage({ prompt, sessionId, model }) {
    const webhook = process.env.N8N_IMAGE_WEBHOOK;
    if (!webhook) throw new Error('N8N_IMAGE_WEBHOOK nicht gesetzt — im Vault anlegen');
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, sessionId, model }),
    });
    if (!r.ok) throw new Error(`n8n image ${r.status}`);
    return r.json();
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

  app.get('/api/models', requireAuth(), (req, res) => {
    const available = MODELS.map(m => ({
      ...m,
      available: m.provider === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY
        : !!(process.env.GROK_API_KEY || process.env.XAI_API_KEY),
    }));
    res.json({ models: available });
  });

  // Streaming-Chat-Endpoint
  app.post('/api/chat', requireAuth(), async (req, res) => {
    const { sid, model, messages, systemPrompt, imagePrompt } = req.body || {};
    if (!sid || !model) return res.status(400).json({ error: 'sid + model erforderlich' });

    const modelDef = MODELS.find(m => m.id === model);
    if (!modelDef) return res.status(400).json({ error: `Unbekanntes Modell: ${model}` });

    // /image-Kommando → n8n, kein Streaming
    if (imagePrompt) {
      try {
        const result = await requestImage({ prompt: imagePrompt, sessionId: sid, model });
        const imageUrl = result.imageUrl || result.message?.imageUrl || '';
        await appendMessage({ sid, role: 'assistant', content: imagePrompt, type: 'image', model, imageUrl });
        return res.json({ type: 'image', imageUrl });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // Text-Chat → SSE-Streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      let full;
      if (modelDef.provider === 'anthropic') {
        full = await streamAnthropic({ model, messages, systemPrompt, res });
      } else if (modelDef.provider === 'xai') {
        full = await streamXai({ model, messages, systemPrompt, res });
      } else {
        throw new Error(`Unbekannter Provider: ${modelDef.provider}`);
      }
      await appendMessage({ sid, role: 'assistant', content: full, type: 'text', model });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  });

  return { ensureSchema };
}
