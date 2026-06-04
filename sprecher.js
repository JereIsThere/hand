// sprecher — Chat-Backend für Die Hand.
// Sessions + Messages in OrientDB. KI-Calls DIREKT in hand (Anthropic + xAI),
// Keys aus Vault/.env. (gehirn-Proxy kommt später wieder — Tools bringen ihre
// API dann selbst mit.)

const sqlStr = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''").slice(0, 8000)}'`;
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

// ── Modell-Katalog ─────────────────────────────────────────────────────
// provider: 'anthropic' | 'xai' | 'openai' | 'gemini'.  group: text | image | video.
const CATALOG = [
  { id: 'claude-sonnet-4-6',   family: 'claude',  label: 'Claude Sonnet 4.6',    provider: 'anthropic', group: 'text' },
  { id: 'claude-opus-4-8',     family: 'claude',  label: 'Claude Opus 4.8',      provider: 'anthropic', group: 'text' },
  { id: 'claude-haiku-4-5',    family: 'claude',  label: 'Claude Haiku 4.5',     provider: 'anthropic', group: 'text' },
  { id: 'grok-3',              family: 'grok',    label: 'Grok 3',               provider: 'xai',       group: 'text' },
  { id: 'grok-3-mini',         family: 'grok',    label: 'Grok 3 Mini',          provider: 'xai',       group: 'text' },
  { id: 'grok-2-image',        family: 'grok',    label: 'Grok Image',           provider: 'xai',       group: 'image' },
  { id: 'gpt-4o',              family: 'gpt',     label: 'GPT-4o',               provider: 'openai',    group: 'text' },
  { id: 'gpt-4o-mini',         family: 'gpt',     label: 'GPT-4o Mini',          provider: 'openai',    group: 'text' },
  { id: 'o3-mini',             family: 'gpt',     label: 'o3-mini',              provider: 'openai',    group: 'text' },
  { id: 'gemini-2.0-flash',    family: 'gemini',  label: 'Gemini 2.0 Flash',     provider: 'gemini',    group: 'text' },
  { id: 'gemini-1.5-pro',      family: 'gemini',  label: 'Gemini 1.5 Pro',       provider: 'gemini',    group: 'text' },
  { id: 'gemini-1.5-flash',    family: 'gemini',  label: 'Gemini 1.5 Flash',     provider: 'gemini',    group: 'text' },
];

const keyFor = (provider) => {
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'openai')    return process.env.OPENAI_API_KEY;
  if (provider === 'gemini')    return process.env.GEMINI_API_KEY;
  return process.env.GROK_API_KEY || process.env.XAI_API_KEY;
};

function modelById(id) { return CATALOG.find((m) => m.id === id); }

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
      await sql(`UPDATE ${rid} SET title=${sqlStr(title || '')}, model=${sqlStr(model || '')}, updatedAt=${sqlStr(now)}`);
    } else {
      await sql(`INSERT INTO SprecherSession SET sid=${sqlStr(sid)}, title=${sqlStr(title || 'Neues Gespräch')}, model=${sqlStr(model || '')}, systemPrompt=${sqlStr(systemPrompt || '')}, createdAt=${sqlStr(now)}, updatedAt=${sqlStr(now)}`);
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
    await sql(`INSERT INTO SprecherMessage SET sid=${sqlStr(sid)}, role=${sqlStr(role)}, content=${sqlStr(content || '')}, type=${sqlStr(type || 'text')}, model=${sqlStr(model || '')}, imageUrl=${sqlStr(imageUrl || '')}, ts=${sqlStr(ts)}`);
    await sql(`UPDATE SprecherSession SET updatedAt=${sqlStr(ts.slice(0, 19))} WHERE sid=${sqlStr(sid)}`);
  }

  // ── Normalisierung der Messages für die jeweilige API ──────────────────
  function toAnthropic(messages) {
    return (messages || []).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }],
    })).filter((m) => m.content.length);
  }
  function toOpenAiStyle(messages) {
    // xAI = OpenAI-kompatibel; Bild-Parts (Vision) hier vereinfacht zu Text.
    return (messages || []).map((m) => {
      let content = m.content;
      if (Array.isArray(content)) {
        content = content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
      }
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(content || '') };
    }).filter((m) => m.content);
  }

  // ── Text-Streaming: Anthropic ──────────────────────────────────────────
  async function streamAnthropic({ model, messages, systemPrompt, res }) {
    const key = keyFor('anthropic');
    if (!key) throw new Error('ANTHROPIC_API_KEY fehlt (im Vault/Setup setzen)');
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 8192, stream: true, messages: toAnthropic(messages), ...(systemPrompt ? { system: systemPrompt } : {}) }),
    });
    if (!upstream.ok) throw new Error(`Anthropic ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`);
    return pipeSSE(upstream, res, (ev) => ev.delta?.text || '');
  }

  // ── Text-Streaming: OpenAI ─────────────────────────────────────────────
  async function streamOpenAI({ model, messages, systemPrompt, res }) {
    const key = keyFor('openai');
    if (!key) throw new Error('OPENAI_API_KEY fehlt (im Vault/Setup setzen)');
    const msgs = [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...toOpenAiStyle(messages)];
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: msgs, stream: true, max_tokens: 8192 }),
    });
    if (!upstream.ok) throw new Error(`OpenAI ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`);
    return pipeSSE(upstream, res, (ev) => ev.choices?.[0]?.delta?.content || '');
  }

  // ── Text-Streaming: Gemini ─────────────────────────────────────────────
  function toGemini(messages, systemPrompt) {
    const contents = (messages || []).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: Array.isArray(m.content)
        ? m.content.filter((p) => p.type === 'text').map((p) => ({ text: p.text }))
        : [{ text: String(m.content || '') }],
    })).filter((m) => m.parts.length);
    return { contents, ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}) };
  }

  async function streamGemini({ model, messages, systemPrompt, res }) {
    const key = keyFor('gemini');
    if (!key) throw new Error('GEMINI_API_KEY fehlt (im Vault/Setup setzen)');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(key)}&alt=sse`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...toGemini(messages, systemPrompt), generationConfig: { maxOutputTokens: 8192 } }),
    });
    if (!upstream.ok) throw new Error(`Gemini ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`);
    return pipeSSE(upstream, res, (ev) => ev.candidates?.[0]?.content?.parts?.[0]?.text || '');
  }

  // ── Text-Streaming: xAI (OpenAI-Format) ────────────────────────────────
  async function streamXai({ model, messages, systemPrompt, res }) {
    const key = keyFor('xai');
    if (!key) throw new Error('GROK_API_KEY fehlt (im Vault/Setup setzen)');
    const msgs = [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...toOpenAiStyle(messages)];
    const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: msgs, stream: true, max_tokens: 8192 }),
    });
    if (!upstream.ok) throw new Error(`xAI ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`);
    return pipeSSE(upstream, res, (ev) => ev.choices?.[0]?.delta?.content || '');
  }

  // Liest Upstream-SSE, extrahiert Delta via picker, schreibt {delta} an Client.
  async function pipeSSE(upstream, res, pick) {
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const delta = pick(JSON.parse(raw));
          if (delta) { full += delta; res.write(`data: ${JSON.stringify({ delta })}\n\n`); }
        } catch {}
      }
    }
    return full;
  }

  // ── Bild-Generierung: xAI ──────────────────────────────────────────────
  async function generateImage({ model, prompt }) {
    const key = keyFor('xai');
    if (!key) throw new Error('GROK_API_KEY fehlt (im Vault/Setup setzen)');
    const upstream = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || 'grok-2-image', prompt, n: 1 }),
    });
    if (!upstream.ok) throw new Error(`xAI image ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`);
    const data = await upstream.json();
    return data.data?.[0]?.url || data.data?.[0]?.b64_json || '';
  }

  // ── HTTP-Routen ─────────────────────────────────────────────────────────
  app.get('/api/sessions', requireAuth(), async (req, res) => {
    try { res.json({ sessions: await listSessions() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/sessions/:sid', requireAuth(), async (req, res) => {
    try {
      const s = await getSession(safeId(req.params.sid));
      if (!s) return res.status(404).json({ error: 'nicht gefunden' });
      res.json({ session: s, messages: await getMessages(s.sid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/sessions/:sid', requireAuth(), async (req, res) => {
    try { await upsertSession({ sid: safeId(req.params.sid), ...req.body }); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
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

  // Modelle gruppiert (text/image/video), nur die mit vorhandenem Key.
  app.get('/api/models', requireAuth(), (req, res) => {
    const out = { text: [], image: [], video: [] };
    for (const m of CATALOG) {
      if (!keyFor(m.provider)) continue;
      out[m.group].push({ id: m.id, family: m.family, label: m.label });
    }
    res.json(out);
  });

  // Chat: text (SSE), image (JSON), video (noch nicht — kommt mit gehirn).
  app.post('/api/chat', requireAuth(), async (req, res) => {
    const { sid, model, messages, systemPrompt, imagePrompt, mode, prompt } = req.body || {};
    if (!sid) return res.status(400).json({ error: 'sid erforderlich' });

    if (mode === 'image' || imagePrompt) {
      const activePrompt = imagePrompt || prompt || messages?.[messages.length - 1]?.content;
      if (!activePrompt) return res.status(400).json({ error: 'prompt erforderlich' });
      try {
        const imageUrl = await generateImage({ model, prompt: activePrompt });
        await appendMessage({ sid, role: 'assistant', content: activePrompt, type: 'image', model, imageUrl });
        return res.json({ type: 'image', imageUrl, model });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (mode === 'video') {
      return res.status(501).json({ error: 'Video kommt später (braucht gehirn).' });
    }

    if (!model) return res.status(400).json({ error: 'model erforderlich' });
    const def = modelById(model);
    if (!def) return res.status(400).json({ error: `Unbekanntes Modell: ${model}` });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      const full = def.provider === 'anthropic'
        ? await streamAnthropic({ model, messages, systemPrompt, res })
        : def.provider === 'openai'
        ? await streamOpenAI({ model, messages, systemPrompt, res })
        : def.provider === 'gemini'
        ? await streamGemini({ model, messages, systemPrompt, res })
        : await streamXai({ model, messages, systemPrompt, res });
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
