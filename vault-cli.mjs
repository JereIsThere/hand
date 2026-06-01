#!/usr/bin/env node
// Die Hand · Vault CLI
// Spricht mit dem laufenden hand-Server auf localhost:3737.
// Voraussetzung: Admin-Session-Cookie (auto-gelesen aus .vault-session).
//
// vault list                     — alle Secrets (kein Klartext)
// vault get <name>               — Secret-Wert anzeigen
// vault set <name> <value>       — Secret anlegen/überschreiben
// vault set <name> -f <datei>    — Wert aus Datei (z.B. private key)
// vault delete <name>            — Secret löschen
// vault copy <name>              — Wert in Zwischenablage (Windows: clip)
// vault export-env [prefix]      — alle Werte als export KEY=value (für .env)
// vault login                    — Admin-Cookie holen (einmalig)

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const SESSION_FILE = join(__dir, '.vault-session');
const BASE = process.env.HAND_URL || 'http://localhost:3737';

// ── ANSI ──────────────────────────────────────────────────────────────
const t = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  cyan:  '\x1b[36m',
  gold:  '\x1b[33m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  gray:  '\x1b[90m',
};
const c = (color, s) => `${t[color]}${s}${t.reset}`;
const bold = (s) => c('bold', s);
const dim  = (s) => c('dim', s);

function header() {
  console.log(`\n${c('cyan', '✋')}  ${bold('Die Hand')} ${c('gray', '·')} ${c('gold', 'vault')}  ${c('gray', BASE)}\n`);
}

function ok(msg)   { console.log(`${c('green', '✓')}  ${msg}`); }
function err(msg)  { console.error(`${c('red', '✗')}  ${msg}`); }
function info(msg) { console.log(`${c('gray', '·')}  ${msg}`); }

// ── HTTP ──────────────────────────────────────────────────────────────
function loadCookie() {
  try { return existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, 'utf8').trim() : ''; }
  catch { return ''; }
}

async function api(method, path, body) {
  const cookie = loadCookie();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  };
  let res;
  try { res = await fetch(`${BASE}${path}`, opts); }
  catch (e) { throw new Error(`Hand nicht erreichbar (${BASE}): ${e.message}`); }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── COMMANDS ──────────────────────────────────────────────────────────
async function cmdList() {
  const { secrets } = await api('GET', '/api/vault');
  if (!secrets.length) { info('Vault ist leer.'); return; }

  // gruppieren nach service
  const groups = {};
  for (const s of secrets) {
    const g = s.service || '—';
    (groups[g] ||= []).push(s);
  }

  let total = 0;
  for (const [service, items] of Object.entries(groups).sort()) {
    console.log(`  ${c('gold', service)}`);
    for (const s of items) {
      const desc = s.description ? dim(`  ${s.description}`) : '';
      const upd  = s.updatedAt ? dim(` · ${String(s.updatedAt).slice(0, 10)}`) : '';
      console.log(`    ${c('cyan', s.name)}${desc}${upd}`);
      total++;
    }
  }
  console.log(`\n  ${dim(`${total} Secret${total !== 1 ? 's' : ''}`)}`);
}

async function cmdGet(name) {
  if (!name) { err('vault get <name>'); process.exit(1); }
  const s = await api('GET', `/api/vault/${encodeURIComponent(name)}?reveal=1`);
  console.log(`\n  ${bold(name)}`);
  if (s.service)     console.log(`  ${dim('service')}     ${s.service}`);
  if (s.description) console.log(`  ${dim('description')} ${s.description}`);
  console.log(`  ${dim('value')}       ${c('cyan', s.value)}`);
  console.log(`  ${dim('updated')}     ${String(s.updatedAt || '—').slice(0, 16)}\n`);
}

async function cmdSet(args) {
  // vault set <name> <value>   oder   vault set <name> -f <datei>
  const [name, ...rest] = args;
  if (!name) { err('vault set <name> <value>   oder   vault set <name> -f <datei>'); process.exit(1); }
  let value;
  if (rest[0] === '-f') {
    const file = rest[1];
    if (!file) { err('-f braucht einen Dateipfad'); process.exit(1); }
    value = readFileSync(file, 'utf8');
  } else if (rest.length) {
    value = rest.join(' ');
  } else {
    // interaktiv: stdin lesen (z.B. paste)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    const lines = [];
    process.stdout.write(`  Wert für ${c('cyan', name)} (Enter + Ctrl-D zum Abschließen): `);
    for await (const line of rl) lines.push(line);
    value = lines.join('\n');
  }
  if (!value.trim()) { err('Leerer Wert — abgebrochen.'); process.exit(1); }
  // optionale Metadaten via flags --service / --desc
  const serviceIdx = args.indexOf('--service'); const service = serviceIdx >= 0 ? args[serviceIdx + 1] : undefined;
  const descIdx    = args.indexOf('--desc');    const description = descIdx >= 0 ? args[descIdx + 1] : undefined;
  await api('PUT', `/api/vault/${encodeURIComponent(name)}`, { value, service, description });
  ok(`${bold(name)} gespeichert.`);
}

async function cmdDelete(name) {
  if (!name) { err('vault delete <name>'); process.exit(1); }
  const { deleted } = await api('DELETE', `/api/vault/${encodeURIComponent(name)}`);
  if (deleted) ok(`${bold(name)} gelöscht.`);
  else info(`${bold(name)} nicht gefunden.`);
}

async function cmdCopy(name) {
  if (!name) { err('vault copy <name>'); process.exit(1); }
  const s = await api('GET', `/api/vault/${encodeURIComponent(name)}?reveal=1`);
  // Windows: clip, macOS: pbcopy, Linux: xclip/xsel
  try {
    if (process.platform === 'win32') {
      const cp = await import('node:child_process');
      const proc = cp.spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.stdin.write(s.value, 'utf8');
      proc.stdin.end();
      await new Promise(r => proc.on('close', r));
    } else {
      execSync('which pbcopy 2>/dev/null || which xclip 2>/dev/null || which xsel 2>/dev/null', { stdio: 'ignore' });
      const cmd = process.platform === 'darwin' ? 'pbcopy' : 'xclip -selection clipboard';
      execSync(`echo -n "${s.value.replace(/"/g, '\\"')}" | ${cmd}`);
    }
    ok(`${bold(name)} in der Zwischenablage.`);
  } catch {
    err('Zwischenablage nicht verfügbar — Wert:');
    console.log(c('cyan', s.value));
  }
}

async function cmdExportEnv(prefix) {
  const { secrets } = await api('GET', '/api/vault');
  const names = prefix
    ? secrets.filter(s => s.name.startsWith(prefix)).map(s => s.name)
    : secrets.map(s => s.name);
  if (!names.length) { info('Keine Secrets gefunden.'); return; }
  for (const name of names) {
    const s = await api('GET', `/api/vault/${encodeURIComponent(name)}?reveal=1`);
    console.log(`export ${name}='${s.value.replace(/'/g, "'\\''")}'`);
  }
}

function cmdHelp() {
  header();
  console.log(`${bold('Verwendung')}  vault <command> [args]\n`);
  const cmds = [
    ['list',               '',                        'Alle Secrets (kein Klartext)'],
    ['get',                '<name>',                  'Wert anzeigen'],
    ['set',                '<name> <value>',          'Secret anlegen / überschreiben'],
    ['set',                '<name> -f <datei>',       'Wert aus Datei (SSH-Key etc.)'],
    ['set',                '<name> --service <s>',    'Mit Service-Label'],
    ['delete',             '<name>',                  'Secret löschen'],
    ['copy',               '<name>',                  'Wert in Zwischenablage'],
    ['export-env',         '[prefix]',                'Alle Werte als export KEY=value'],
  ];
  for (const [cmd, args, desc] of cmds) {
    const left = `  vault ${c('gold', cmd)} ${dim(args)}`;
    console.log(`${left.padEnd(52)}${c('gray', desc)}`);
  }
  console.log(`\n  ${dim('HAND_URL=http://... vault list')}   anderen Server ansprechen\n`);
}

// ── MAIN ──────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

try {
  switch (cmd) {
    case 'list':       header(); await cmdList();            break;
    case 'get':        header(); await cmdGet(args[0]);      break;
    case 'set':        header(); await cmdSet(args);         break;
    case 'delete':
    case 'rm':         header(); await cmdDelete(args[0]);   break;
    case 'copy':
    case 'cp':         await cmdCopy(args[0]);               break;
    case 'export-env': await cmdExportEnv(args[0]);          break;
    default:           cmdHelp();
  }
} catch (e) {
  err(e.message);
  if (e.message.includes('401') || e.message.includes('angemeldet')) {
    info(`Tipp: Du bist nicht als Admin eingeloggt. Stell sicher, dass hand läuft`);
    info(`und du eingeloggt bist (https://hand.jeremias-groehl.de).`);
    info(`Lokaler Dev-Modus (kein GOOGLE_CLIENT_ID): funktioniert ohne Login.`);
  }
  process.exit(1);
}
