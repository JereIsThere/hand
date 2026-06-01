#!/usr/bin/env node
// Die Hand · AI Shell
// Interaktive Shell mit Haiku-Analyse vor jeder Ausführung.
// Commands werden geloggt (mainCmd + subCmd) an den hand-Server.
//
// Umgebungsvariablen:
//   ANTHROPIC_API_KEY  — Pflicht für die Analyse
//   HAND_URL           — hand-Server (default: http://localhost:3737)
//   HAND_SHELL_NOLOG   — auf 1 setzen um Logging zu deaktivieren
//   HAND_SHELL_NOAI    — auf 1 setzen um Analyse zu deaktivieren (reiner Turbo-Modus)

import { createInterface } from 'node:readline';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

// ── ANSI ──────────────────────────────────────────────────────────────
const t = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m',
  cyan: '\x1b[36m', gold: '\x1b[33m', green: '\x1b[32m',
  red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m', blue: '\x1b[34m',
  bgRed: '\x1b[41m', bgYellow: '\x1b[43m',
};
const c  = (color, s) => `${t[color]}${s}${t.reset}`;
const RISK_COLOR = { low: 'green', medium: 'yellow', high: 'red', critical: 'bgRed' };
const RISK_ICON  = { low: '○', medium: '◔', high: '◕', critical: '●' };

const BASE    = process.env.HAND_URL || 'http://localhost:3737';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const NO_AI   = process.env.HAND_SHELL_NOAI  === '1';
const NO_LOG  = process.env.HAND_SHELL_NOLOG === '1';

// ── Prompt ────────────────────────────────────────────────────────────
function gitBranch() {
  try {
    return execSync('git branch --show-current 2>/dev/null', { encoding: 'utf8', timeout: 500 }).trim();
  } catch { return ''; }
}

function prompt() {
  const cwd = process.cwd().replace(process.env.HOME || process.env.USERPROFILE || '', '~');
  const branch = gitBranch();
  const git = branch ? ` ${c('gray', 'on')} ${c('cyan', branch)}` : '';
  return `\n${c('gold', '✋')} ${c('bold', cwd)}${git}\n${c('cyan', '›')} `;
}

// ── Parser: mainCmd + subCmd aus Befehlszeile ─────────────────────────
function parseCommand(input) {
  const parts = input.trim().split(/\s+/);
  const mainCmd = parts[0] || '';
  // subCmd: zweites Token wenn es kein Flag ist (nicht mit - anfängt)
  const subCmd = (parts[1] && !parts[1].startsWith('-')) ? parts[1] : '';
  return { mainCmd, subCmd, fullCmd: input.trim() };
}

// ── Haiku-Analyse via Anthropic API (streaming) ───────────────────────
const SYSTEM = `Du bist ein Shell-Sicherheits- und Effizienz-Analyser.
Analysiere den gegebenen Shell-Command und antworte NUR mit kompaktem JSON (kein Markdown, keine Fences):
{
  "risk": "low|medium|high|critical",
  "summary": "Ein Satz was dieser Command tut",
  "suggestion": "Bessere Alternative oder Optimierung — leer lassen wenn keiner nötig",
  "warn": "Spezifische Warnung bei risk>=medium — leer lassen wenn keine"
}
Risiko-Richtlinie: low=harmlos/lesend, medium=schreibend/reversibel, high=destruktiv/schwer rückgängig, critical=datenverlust/systemkritisch.
Sei kurz. summary max 80 Zeichen. suggestion max 100 Zeichen.`;

async function analyzeCommand(cmd) {
  if (!API_KEY) return null;
  if (NO_AI)    return null;
  // Triviale Commands direkt ohne API-Call
  const trivial = /^(ls|ll|la|pwd|echo|cat|head|tail|grep|which|type|where|whoami|date|history|clear|cls|exit|cd\s|node -v|npm -v|git status|git log|git diff)/.test(cmd.trim());
  if (trivial) return { risk: 'low', summary: '', suggestion: '', warn: '' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Command: ${cmd}` }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    // Robuster JSON-Parse: erstes { … } extrahieren
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch { return null; }
}

// ── Shell-Log an hand-Server ──────────────────────────────────────────
async function logCommand({ mainCmd, subCmd, fullCmd, risk, summary, suggestion, exitCode, durationMs }) {
  if (NO_LOG) return;
  try {
    await fetch(`${BASE}/api/shell/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mainCmd, subCmd, fullCmd, risk: risk || 'low',
        summary, suggestion, exitCode, durationMs,
        cwd: process.cwd(),
      }),
    });
  } catch { /* Logging ist best-effort */ }
}

// ── Analyse anzeigen ──────────────────────────────────────────────────
function renderAnalysis(analysis, cmd) {
  if (!analysis || (!analysis.summary && analysis.risk === 'low')) return false;
  const risk  = analysis.risk || 'low';
  const color = RISK_COLOR[risk] || 'gray';
  const icon  = RISK_ICON[risk]  || '○';

  process.stdout.write('\n');
  process.stdout.write(`  ${c(color, icon)} ${c('bold', risk.toUpperCase())}  ${c('gray', analysis.summary)}\n`);
  if (analysis.warn)       process.stdout.write(`  ${c('yellow', '⚠')}  ${analysis.warn}\n`);
  if (analysis.suggestion) process.stdout.write(`  ${c('cyan', '→')}  ${c('dim', analysis.suggestion)}\n`);

  // Bei high/critical: explizit bestätigen lassen
  if (risk === 'high' || risk === 'critical') {
    return 'confirm';
  }
  return true;
}

// ── Command ausführen ─────────────────────────────────────────────────
function runCommand(input) {
  return new Promise((resolve) => {
    const start = Date.now();
    // Plattform-Shell
    const [shell, flag] = process.platform === 'win32'
      ? ['cmd.exe', '/c']
      : ['/bin/bash', '-c'];
    const child = spawn(shell, [flag, input], { stdio: 'inherit', shell: false });
    child.on('close', (code) => resolve({ exitCode: code ?? 0, durationMs: Date.now() - start }));
    child.on('error', (e) => { process.stderr.write(`${c('red', 'Fehler')}: ${e.message}\n`); resolve({ exitCode: 1, durationMs: Date.now() - start }); });
  });
}

// ── Built-ins ─────────────────────────────────────────────────────────
function handleBuiltin(input) {
  const parts = input.trim().split(/\s+/);
  if (parts[0] === 'cd') {
    const dir = parts[1] || process.env.HOME || process.env.USERPROFILE || '.';
    try { process.chdir(dir); } catch (e) { process.stderr.write(`cd: ${e.message}\n`); }
    return true;
  }
  if (parts[0] === 'exit' || parts[0] === 'quit') { process.exit(0); }
  return false;
}

// ── REPL ──────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY && !NO_AI) {
    process.stdout.write(`${c('yellow', '⚠')}  ANTHROPIC_API_KEY nicht gesetzt — AI-Analyse deaktiviert.\n`);
    process.stdout.write(`   Setze ANTHROPIC_API_KEY in hand/.env oder starte mit HAND_SHELL_NOAI=1.\n\n`);
  }

  process.stdout.write(`${c('cyan', '✋')}  ${c('bold', 'Die Hand')} ${c('gray', '·')} ${c('gold', 'AI Shell')}`);
  if (!NO_AI && API_KEY) process.stdout.write(`  ${c('gray', 'Haiku analysiert · Logging → ' + BASE)}`);
  process.stdout.write('\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 500,
  });

  const askLine = () => new Promise((resolve) => {
    rl.question(prompt(), resolve);
    rl.once('close', () => { process.stdout.write('\n'); process.exit(0); });
  });

  const confirmRun = () => new Promise((resolve) => {
    rl.question(`\n  ${c('red', '⚡')} ${c('bold', 'Trotzdem ausführen?')} ${c('gray', '[j/N]')} `, (ans) => {
      resolve(ans.trim().toLowerCase() === 'j');
    });
  });

  // Hauptschleife
  while (true) {
    let input;
    try { input = await askLine(); }
    catch { break; }
    if (!input.trim()) continue;

    // Built-ins (cd, exit)
    if (handleBuiltin(input)) continue;

    const { mainCmd, subCmd, fullCmd } = parseCommand(input);

    // AI-Analyse (parallel zum User der wartet)
    let analysis = null;
    if (!NO_AI && API_KEY) {
      process.stdout.write(c('gray', '  ⟳ analysiere…'));
      analysis = await analyzeCommand(fullCmd);
      process.stdout.write('\r\x1b[K'); // Clear "analysiere…" Zeile
    }

    const renderResult = renderAnalysis(analysis, fullCmd);

    let shouldRun = true;
    if (renderResult === 'confirm') {
      shouldRun = await confirmRun();
    }

    if (!shouldRun) {
      process.stdout.write(c('gray', '  abgebrochen.\n'));
      continue;
    }

    const { exitCode, durationMs } = await runCommand(input);

    // Logging (fire-and-forget)
    logCommand({
      mainCmd, subCmd, fullCmd,
      risk: analysis?.risk,
      summary: analysis?.summary,
      suggestion: analysis?.suggestion,
      exitCode, durationMs,
    });

    if (exitCode !== 0) {
      process.stdout.write(`${c('gray', `  exit ${exitCode}`)}\n`);
    }
  }
}

main();
