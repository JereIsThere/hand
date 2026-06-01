// Auth-Schicht für Die Hand: Google-OAuth (OpenID Connect, Authorization-Code-Flow)
// + HMAC-signierte Session-Cookies + Rollen/Status aus OrientDB (Klasse `Person`).
//
// Opt-in: ohne GOOGLE_CLIENT_ID/SECRET/SESSION_SECRET ist Auth AUS und hand
// läuft wie bisher lokal-offen (Single-Operator). Mit gesetzten Vars greift der
// Approval-Flow: Login -> pending -> Admin (arm) genehmigt -> approved.
import crypto from 'node:crypto';

const COOKIE = 'hand_session';
const STATE_COOKIE = 'hand_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage (Sekunden)

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payloadObj, secret) {
  const body = b64url(JSON.stringify(payloadObj));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, { maxAge, secure } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge != null) bits.push(`Max-Age=${maxAge}`);
  if (secure) bits.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const arr = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  arr.push(bits.join('; '));
  res.setHeader('Set-Cookie', arr);
}

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function setupAuth(app, { odb, dbName }) {
  const {
    GOOGLE_CLIENT_ID = '',
    GOOGLE_CLIENT_SECRET = '',
    OAUTH_REDIRECT_URI = 'http://localhost:3737/auth/callback',
    SESSION_SECRET = '',
    ADMIN_EMAILS = '',
  } = process.env;

  const enabled = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && SESSION_SECRET);
  const secure = OAUTH_REDIRECT_URI.startsWith('https://');
  const admins = new Set(
    ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  const sql = (command) =>
    odb(`/command/${dbName}/sql`, {
      method: 'POST', body: command, headers: { 'Content-Type': 'text/plain' },
    });

  async function ensurePersonSchema() {
    const stmts = [
      'CREATE CLASS Person IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY Person.email IF NOT EXISTS STRING',
      'CREATE PROPERTY Person.name IF NOT EXISTS STRING',
      'CREATE PROPERTY Person.picture IF NOT EXISTS STRING',
      'CREATE PROPERTY Person.role IF NOT EXISTS STRING',
      'CREATE PROPERTY Person.status IF NOT EXISTS STRING',
      'CREATE PROPERTY Person.createdAt IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Person.decidedAt IF NOT EXISTS DATETIME',
      'CREATE INDEX Person.email IF NOT EXISTS UNIQUE',
    ];
    for (const s of stmts) await sql(s);
  }

  async function findPerson(email) {
    const r = await sql(`SELECT @rid, * FROM Person WHERE email = ${sqlStr(email)} LIMIT 1`);
    return r.result?.[0] || null;
  }

  async function listPersons(status) {
    const where = status ? ` WHERE status = ${sqlStr(status)}` : '';
    const r = await sql(`SELECT @rid, * FROM Person${where} ORDER BY createdAt DESC LIMIT 500`);
    return r.result || [];
  }

  async function decidePerson(rid, decision) {
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const safe = String(rid).replace(/[^0-9:#]/g, '');
    await sql(`UPDATE ${safe} SET status = ${sqlStr(status)}, decidedAt = ${sqlStr(now)}`);
    return { rid: safe, status };
  }

  // Beim Login: Person upserten. Admins (ADMIN_EMAILS) werden automatisch
  // approved+admin, alle anderen starten als friend/pending.
  async function upsertOnLogin(profile) {
    const email = profile.email.toLowerCase();
    const isAdmin = admins.has(email);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let person = await findPerson(email);
    if (!person) {
      await sql(
        `INSERT INTO Person SET email = ${sqlStr(email)}, name = ${sqlStr(profile.name || '')}, ` +
        `picture = ${sqlStr(profile.picture || '')}, role = ${sqlStr(isAdmin ? 'admin' : 'friend')}, ` +
        `status = ${sqlStr(isAdmin ? 'approved' : 'pending')}, createdAt = ${sqlStr(now)}`
      );
      person = await findPerson(email);
    } else if (isAdmin && (person.role !== 'admin' || person.status !== 'approved')) {
      // Admin-Mail nachträglich gesetzt -> hochstufen.
      const safe = String(person['@rid']).replace(/[^0-9:#]/g, '');
      await sql(`UPDATE ${safe} SET role = 'admin', status = 'approved', decidedAt = ${sqlStr(now)}`);
      person = await findPerson(email);
    }
    return person;
  }

  function sessionFromReq(req) {
    if (!enabled) return { email: 'operator', name: 'Operator', role: 'admin', status: 'approved' };
    return unsign(parseCookies(req)[COOKIE], SESSION_SECRET);
  }

  // Aktueller User inkl. frischem Rollen/Status-Lookup (Genehmigung wirkt sofort).
  async function currentUser(req) {
    if (!enabled) return { email: 'operator', name: 'Operator', role: 'admin', status: 'approved' };
    const sess = sessionFromReq(req);
    if (!sess?.email) return null;
    const email = sess.email.toLowerCase();
    // Admins (ADMIN_EMAILS) sind unabhängig von der DB-Verfügbarkeit drin —
    // so funktioniert der Admin-Login auch ohne erreichbare OrientDB.
    if (admins.has(email)) {
      return { email, name: sess.name || email, role: 'admin', status: 'approved' };
    }
    try {
      const p = await findPerson(email);
      if (!p) return null;
      return { email: p.email, name: p.name, picture: p.picture, role: p.role, status: p.status };
    } catch {
      return null; // DB nicht erreichbar -> Freunde können (noch) nicht rein
    }
  }

  const requireAuth = (handler) => async (req, res, next) => {
    if (!enabled) return next ? next() : handler(req, res);
    const u = await currentUser(req);
    if (u && u.status === 'approved') { req.user = u; return next ? next() : handler(req, res); }
    res.status(401).json({ error: 'nicht angemeldet', authEnabled: true });
  };

  const requireAdmin = (handler) => async (req, res, next) => {
    if (!enabled) return next ? next() : handler(req, res);
    const u = await currentUser(req);
    if (u && u.role === 'admin' && u.status === 'approved') {
      req.user = u; return next ? next() : handler(req, res);
    }
    res.status(403).json({ error: 'nur Admin' });
  };

  // ── Routes ──────────────────────────────────────────────────────────
  app.get('/api/me', async (req, res) => {
    res.json({ authEnabled: enabled, user: await currentUser(req) });
  });

  if (enabled) {
    app.get('/auth/login', (req, res) => {
      const state = crypto.randomBytes(16).toString('hex');
      setCookie(res, STATE_COOKIE, sign({ state }, SESSION_SECRET), { maxAge: 600, secure });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      url.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', state);
      url.searchParams.set('prompt', 'select_account');
      res.redirect(url.toString());
    });

    app.get('/auth/callback', async (req, res) => {
      try {
        const { code, state } = req.query;
        const saved = unsign(parseCookies(req)[STATE_COOKIE], SESSION_SECRET);
        if (!code || !state || !saved || saved.state !== state) {
          return res.status(400).send('OAuth-State ungültig. <a href="/auth/login">nochmal</a>');
        }
        // Code -> Token
        const tokRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: String(code),
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: OAUTH_REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });
        const tok = await tokRes.json();
        if (!tok.access_token) throw new Error('Token-Exchange fehlgeschlagen');
        // Token -> Userinfo
        const uiRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        const profile = await uiRes.json();
        if (!profile.email || profile.email_verified === false) {
          throw new Error('Keine verifizierte E-Mail von Google');
        }
        // Person persistieren — best-effort: schlägt die DB fehl, kommt der
        // Admin trotzdem rein (Freunde brauchen die DB für den pending-State).
        try { await upsertOnLogin(profile); }
        catch (e) { console.error(`  ! Person-Upsert (OrientDB erreichbar?): ${e.message}`); }
        setCookie(res, COOKIE,
          sign({ email: profile.email.toLowerCase(), name: profile.name || '' }, SESSION_SECRET),
          { maxAge: SESSION_MAX_AGE, secure });
        setCookie(res, STATE_COOKIE, '', { maxAge: 0, secure });
        res.redirect('/');
      } catch (e) {
        res.status(500).send(`Login-Fehler: ${e.message}. <a href="/auth/login">nochmal</a>`);
      }
    });

    app.post('/auth/logout', (req, res) => {
      setCookie(res, COOKIE, '', { maxAge: 0, secure });
      res.json({ ok: true });
    });
  }

  // ── Admin-API: Freunde verwalten ───────────────────────────────────
  app.get('/api/persons', requireAdmin(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    res.json({ rows: await listPersons(status) });
  }));

  app.post('/api/persons/:rid/approve', requireAdmin(async (req, res) => {
    res.json(await decidePerson(`#${req.params.rid}`, 'approve'));
  }));

  app.post('/api/persons/:rid/reject', requireAdmin(async (req, res) => {
    res.json(await decidePerson(`#${req.params.rid}`, 'reject'));
  }));

  return { enabled, ensurePersonSchema, requireAuth, requireAdmin, currentUser };
}
