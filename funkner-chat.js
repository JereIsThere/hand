// funkner-chat.js — KI-Chat-Proxy für die Funkner-App (Auge).
// Proxied gehirn /models + /gen/text via hand, damit die App keinen
// zweiten API-Key braucht. Auth: CAPTURE_API_KEY (wie Capture-API).
//
// API:
//   GET  /api/funkner/models   → verfügbare Modelle (proxied gehirn /models)
//   POST /api/funkner/chat     → KI-Chat (proxied gehirn /gen/text, SSE)

import { timingSafeEqual } from 'crypto';

export function setupFunknerChat(app) {
  const gehirnUrl = (process.env.GEHIRN_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const gehirnKey = () => process.env.GEHIRN_API_KEY || '';
  const apiKey = () => process.env.CAPTURE_API_KEY || '';

  function validBearer(req) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(apiKey());
    return a.length === b.length && timingSafeEqual(a, b);
  }

  function requireCaptureAuth(req, res, next) {
    if (!apiKey()) {
      return res.status(503).json({ error: 'Funkner-Chat aus — CAPTURE_API_KEY nicht gesetzt' });
    }
    if (!validBearer(req)) {
      return res.status(401).json({ error: 'Bearer-Token fehlt oder ist falsch' });
    }
    next();
  }

  // GET /api/funkner/models — verfügbare KI-Modelle (proxied gehirn /models)
  app.get('/api/funkner/models', requireCaptureAuth, async (_req, res) => {
    try {
      if (!gehirnKey()) {
        return res.status(503).json({ error: 'GEHIRN_API_KEY nicht gesetzt in hand' });
      }
      const r = await fetch(`${gehirnUrl}/models`, {
        headers: { Authorization: `Bearer ${gehirnKey()}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `gehirn ${r.status}`);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // POST /api/funkner/chat — KI-Chat (proxied gehirn /gen/text, SSE)
  app.post('/api/funkner/chat', requireCaptureAuth, async (req, res) => {
    try {
      if (!gehirnKey()) {
        return res.status(503).json({ error: 'GEHIRN_API_KEY nicht gesetzt in hand' });
      }

      const { messages, model, system } = req.body || {};
      if (!messages?.length) {
        return res.status(400).json({ error: 'messages array required' });
      }

      const body = { messages, model, stream: true };
      if (system) body.messages = [{ role: 'system', content: system }, ...body.messages];

      const upstream = await fetch(`${gehirnUrl}/gen/text`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gehirnKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json({ error: err.error || `gehirn ${upstream.status}` });
      }

      // SSE direct pass-through
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) res.write(trimmed + '\n');
          }
        }
        if (buf.trim()) res.write(buf.trim() + '\n');
      } catch (e) {
        if (res.writable) {
          res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        }
      } finally {
        res.end();
      }
    } catch (e) {
      if (!res.headersSent) {
        res.status(502).json({ error: e.message });
      } else {
        try { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); } catch {}
        res.end();
      }
    }
  });
}
