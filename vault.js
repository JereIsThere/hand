// Vault — verschlüsselter Secret-Speicher.
//
// Verschlüsselung: AES-256-GCM, Key aus VAULT_KEY (.env).
// Jeder Secret wird einzeln verschlüsselt (eigener IV) — kompromittierter
// DB-Record gefährdet nicht die anderen.
//
// OrientDB-Klasse: Secret { name, service?, description?, ciphertext, iv, tag, createdAt, updatedAt }
// API: /api/vault/* (Admin-only via requireAdmin aus auth.js)
import crypto from 'node:crypto';

const ALG = 'aes-256-gcm';

function getKey() {
  const k = process.env.VAULT_KEY || '';
  if (!k) throw new Error('VAULT_KEY nicht gesetzt — in .env ergänzen');
  // Hex (64 Zeichen) oder Base64url (43+) → 32-Byte-Buffer
  if (/^[0-9a-f]{64}$/i.test(k)) return Buffer.from(k, 'hex');
  const buf = Buffer.from(k, 'base64url');
  if (buf.length !== 32) throw new Error('VAULT_KEY muss 32 Byte sein (64 Hex-Zeichen oder base64url)');
  return buf;
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
}

function decrypt({ ciphertext, iv, tag }) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return decipher.update(Buffer.from(ciphertext, 'base64')) + decipher.final('utf8');
}

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const safeRid = (r) => String(r).replace(/[^0-9:#]/g, '');

export function setupVault(app, { odb, dbName, requireAdmin }) {
  const sql = (cmd) => odb(`/command/${dbName}/sql`, {
    method: 'POST', body: cmd, headers: { 'Content-Type': 'text/plain' },
  });

  async function ensureSchema() {
    for (const s of [
      'CREATE CLASS Secret IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY Secret.name IF NOT EXISTS STRING',
      'CREATE PROPERTY Secret.service IF NOT EXISTS STRING',
      'CREATE PROPERTY Secret.description IF NOT EXISTS STRING',
      'CREATE PROPERTY Secret.ciphertext IF NOT EXISTS STRING',
      'CREATE PROPERTY Secret.iv IF NOT EXISTS STRING',
      'CREATE PROPERTY Secret.tag IF NOT EXISTS STRING',
      'CREATE PROPERTY Secret.createdAt IF NOT EXISTS DATETIME',
      'CREATE PROPERTY Secret.updatedAt IF NOT EXISTS DATETIME',
      'CREATE INDEX Secret.name IF NOT EXISTS UNIQUE',
    ]) await sql(s);
  }

  // ── CRUD ────────────────────────────────────────────────────────────
  async function listSecrets() {
    const r = await sql(`SELECT @rid, name, service, description, createdAt, updatedAt FROM Secret ORDER BY service ASC, name ASC LIMIT 500`);
    return r.result || [];
  }

  async function getSecret(name) {
    const r = await sql(`SELECT @rid, * FROM Secret WHERE name = ${sqlStr(name)} LIMIT 1`);
    const row = r.result?.[0];
    if (!row) return null;
    return { ...row, value: decrypt(row) };
  }

  async function upsertSecret({ name, value, service, description }) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const enc = encrypt(value);
    const existing = await sql(`SELECT @rid FROM Secret WHERE name = ${sqlStr(name)} LIMIT 1`);
    if (existing.result?.[0]) {
      const rid = safeRid(existing.result[0]['@rid']);
      await sql(`UPDATE ${rid} SET ciphertext = ${sqlStr(enc.ciphertext)}, iv = ${sqlStr(enc.iv)}, tag = ${sqlStr(enc.tag)}, service = ${sqlStr(service || '')}, description = ${sqlStr(description || '')}, updatedAt = ${sqlStr(now)}`);
    } else {
      await sql(`INSERT INTO Secret SET name = ${sqlStr(name)}, ciphertext = ${sqlStr(enc.ciphertext)}, iv = ${sqlStr(enc.iv)}, tag = ${sqlStr(enc.tag)}, service = ${sqlStr(service || '')}, description = ${sqlStr(description || '')}, createdAt = ${sqlStr(now)}, updatedAt = ${sqlStr(now)}`);
    }
    return { name };
  }

  async function deleteSecret(name) {
    const r = await sql(`DELETE VERTEX Secret WHERE name = ${sqlStr(name)}`);
    return { deleted: r.result?.count ?? 0 };
  }

  // ── HTTP API ─────────────────────────────────────────────────────────
  // Alles Admin-only (requireAdmin ist middleware aus auth.js).
  app.get('/api/vault', requireAdmin(), async (req, res) => {
    try { res.json({ secrets: await listSecrets() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/vault/:name', requireAdmin(), async (req, res) => {
    try {
      const s = await getSecret(req.params.name);
      if (!s) return res.status(404).json({ error: 'nicht gefunden' });
      // Wert nur zurückgeben wenn ?reveal=1
      if (req.query.reveal !== '1') delete s.value;
      res.json(s);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/vault/:name', requireAdmin(), async (req, res) => {
    try {
      const { value, service, description } = req.body || {};
      if (!value) return res.status(400).json({ error: 'value fehlt' });
      res.json(await upsertSecret({ name: req.params.name, value, service, description }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/vault/:name', requireAdmin(), async (req, res) => {
    try { res.json(await deleteSecret(req.params.name)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lädt alle Secrets aus dem Vault in process.env (nur wenn noch nicht gesetzt).
  // Aufruf NACH OrientDB-Verbindung — überschreibt .env-Werte NICHT (explizit
  // gesetzte .env-Values haben Vorrang), ergänzt aber fehlende.
  async function loadIntoEnv() {
    try {
      const rows = await listSecrets();
      let loaded = 0;
      for (const row of rows) {
        if (process.env[row.name] !== undefined) continue; // .env hat Vorrang
        try {
          const full = await getSecret(row.name);
          if (full?.value) { process.env[row.name] = full.value; loaded++; }
        } catch { /* einzelner Secret kaputt -> überspringen */ }
      }
      if (loaded > 0) console.log(`        Vault: ${loaded} Secret${loaded !== 1 ? 's' : ''} in env geladen`);
    } catch (e) {
      console.error(`  ! Vault-env-Load fehlgeschlagen: ${e.message}`);
    }
  }

  return { ensureSchema, loadIntoEnv };
}
