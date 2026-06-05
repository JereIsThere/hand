// ueber.js — Über-Seite, Roadmap, und (Electron-only) Update-/Channel-Verwaltung.
import { $ } from '../shared/ui.js';
import { me } from '../auth/gate.js';

const PLATFORMS = [
  { icon: '🖥️', name: 'Windows',   sub: 'Electron-App + NSIS-Installer + Auto-Update', status: 'done' },
  { icon: '📱', name: 'Android',   sub: 'PWA via Chrome — installierbar',               status: 'done' },
  { icon: '🍎', name: 'iOS',       sub: 'PWA via Safari — installierbar',               status: 'done' },
  { icon: '🌐', name: 'Mac/Linux', sub: 'Browser (PWA) — kein nativer Build geplant',   status: 'planned' },
];

const ROADMAP = [
  {
    phase: '✅ v0.7–v1.1 — Fundament & Betrieb',
    status: 'done',
    items: [
      'OrientDB-Admin (Schema, Records, Query, Wizard)',
      'SSH-Tunnel-Manager',
      'Auge-Submissions + Approval-Flow',
      'Google-OAuth + Freundeskreis-Rollen',
      'Vault (AES-256-GCM, GUI + CLI)',
      'AI Shell (Haiku, ShellLog)',
      'sprecher (Claude + Grok + OpenAI + Gemini, Sessions, Bild, Streaming)',
      'Setup-Wizard (Keys → Vault)',
      'PWA (Android + iOS)',
      'Windows-Installer (Electron + NSIS + Auto-Update)',
      'Server-Deploy (systemd + nginx + CI)',
      'Splash-Screen, Update-Channel (latest ↔ beta)',
      'Profil-Menü, Invite-Links',
    ],
  },
  {
    phase: '🔨 v1.2 — UX & Updates',
    status: 'active',
    items: [
      'Dynamische Versionsnummer aus package.json',
      'Windows-style Update-Toast (Electron + Dev)',
      'Channel-Switcher im Über-Tool',
      'sprecher: No-Keys-State mit Setup-CTA',
      'sprecher: Inline-Titelbearbeitung (kein prompt())',
      'sprecher: System-Prompt pro Session',
      'Setup-Wizard: OpenAI + Gemini Keys',
    ],
  },
  {
    phase: '📋 v1.3 — Produktivität',
    status: 'planned',
    items: [
      'Command Palette (Ctrl+K)',
      'sprecher: Grok-Vision (Bild-Verständnis)',
      'sprecher: Video-Generierung (/video)',
      'sprecher: Export (Markdown / Text)',
      'API-Key-Dashboard (Service + Status)',
    ],
  },
  {
    phase: '💡 Ideen',
    status: 'idea',
    items: [
      'arm/hand-Split (Admin vs. casual Freundes-App)',
      'Self-Improvement Tool (Feature sandboxed testen)',
      'Code-Signatur für Windows-Installer (SmartScreen-Warnung weg)',
      'docker-compose full-stack (auge + OrientDB + hand)',
    ],
  },
];

const STATUS_COLOR = { done: '#2dd66e', active: '#00d4c8', planned: '#9a8fb5', idea: '#6f6488' };
const STATUS_BG    = {
  done:    'rgba(45,214,110,.08)',
  active:  'rgba(0,212,200,.08)',
  planned: 'rgba(154,143,181,.06)',
  idea:    'rgba(111,100,136,.05)',
};

// ── Channel-Switcher (Electron-only) ─────────────────────────────────
async function renderChannelCard() {
  if (!window.electronAPI) return '';

  const channel = await window.electronAPI.getChannel().catch(() => 'latest');
  const isBeta  = channel === 'beta';
  const col     = isBeta ? '#d4a200' : '#00d4c8';
  const bg      = isBeta ? 'rgba(212,162,0,.07)' : 'rgba(0,212,200,.07)';
  const border  = isBeta ? '#3a2d0033' : '#00d4c822';

  return `
    <div id="upd-channel-card" style="margin-bottom:28px;background:${bg};border:1px solid ${border};border-radius:14px;padding:18px 20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:20px;">${isBeta ? '🟡' : '🟢'}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#e8e0f0;">Update-Kanal</div>
          <div style="font-size:11px;color:#9a8fb5;margin-top:2px;">
            Aktiv: <strong style="color:${col};">${isBeta ? 'dev — Pre-Releases' : 'prod — stabil'}</strong>
          </div>
        </div>
        <button id="upd-check-btn"
          style="background:none;border:1px solid #2a1d44;color:#9a8fb5;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;white-space:nowrap;">
          ↻ Jetzt prüfen
        </button>
      </div>

      <div style="display:flex;gap:8px;">
        <button data-ch="latest" class="ch-btn"
          style="flex:1;padding:12px 10px;border-radius:10px;text-align:center;cursor:pointer;font-family:inherit;
                 border:2px solid ${!isBeta ? '#00d4c8' : '#2a1d44'};
                 background:${!isBeta ? 'rgba(0,212,200,.12)' : '#0a0118'};
                 color:${!isBeta ? '#00d4c8' : '#6f6488'};
                 font-weight:${!isBeta ? '700' : '400'};font-size:13px;">
          🟢 prod<br>
          <span style="font-size:10px;font-weight:400;opacity:.75;">Stabile Releases<br>empfohlen</span>
        </button>
        <button data-ch="beta" class="ch-btn"
          style="flex:1;padding:12px 10px;border-radius:10px;text-align:center;cursor:pointer;font-family:inherit;
                 border:2px solid ${isBeta ? '#d4a200' : '#2a1d44'};
                 background:${isBeta ? 'rgba(212,162,0,.10)' : '#0a0118'};
                 color:${isBeta ? '#d4a200' : '#6f6488'};
                 font-weight:${isBeta ? '700' : '400'};font-size:13px;">
          🟡 dev<br>
          <span style="font-size:10px;font-weight:400;opacity:.75;">Pre-Releases<br>neue Features früher</span>
        </button>
      </div>

      <div id="upd-channel-status" style="margin-top:10px;font-size:11px;color:#6f6488;min-height:16px;"></div>
    </div>`;
}

function bindChannelCard() {
  if (!window.electronAPI) return;

  document.querySelectorAll('.ch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.ch;
      window.electronAPI.setChannel(ch);
      const s = document.getElementById('upd-channel-status');
      if (s) s.textContent = `Kanal auf "${ch}" gesetzt — prüfe auf Updates…`;
      setTimeout(renderRoadmap, 700);
    });
  });

  document.getElementById('upd-check-btn')?.addEventListener('click', async () => {
    const s = document.getElementById('upd-channel-status');
    if (s) s.textContent = 'Prüfe auf Updates…';
    try {
      const r  = await fetch('/api/updates/check');
      const d  = await r.json().catch(() => ({}));
      if (s) s.textContent = d.hasUpdate
        ? `Update auf v${d.latest} verfügbar — Toast erscheint gleich.`
        : d.error ? `Fehler: ${d.error}` : `v${d.current} ist die aktuelle Version.`;
    } catch {
      if (s) s.textContent = 'Prüfung fehlgeschlagen (kein Netz?).';
    }
  });
}

// ── Roadmap ───────────────────────────────────────────────────────────
async function renderRoadmap() {
  const content = document.getElementById('ueber-content');
  if (!content) return;

  const channelCard = await renderChannelCard();
  const user = me();

  let html = channelCard + `
    <div style="margin-bottom:24px;">
      <h2 style="font-family:Georgia,serif;font-size:22px;color:#e8e0f0;margin:0 0 4px;">Die Hand</h2>
      <p style="margin:0 0 20px;font-size:12px;color:#6f6488;">
        Tool-Management-Shell ·
        <a href="https://github.com/JereIsThere/hand" target="_blank" style="color:#9a8fb5;">GitHub</a> ·
        <a href="https://github.com/JereIsThere/hand/releases" target="_blank" style="color:#9a8fb5;">Releases</a>
      </p>

      <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6f6488;margin:0 0 10px;">Plattformen</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-bottom:28px;">
        ${PLATFORMS.map(p => {
          const col = STATUS_COLOR[p.status];
          const dot = p.status === 'done' ? '✓' : p.status === 'active' ? '◑' : '·';
          return `<div style="background:${STATUS_BG[p.status]};border:1px solid ${col}33;border-radius:10px;padding:12px;">
            <div style="font-size:16px;margin-bottom:4px;">${p.icon}</div>
            <div style="font-size:12px;font-weight:700;color:${col};">${dot} ${p.name}</div>
            <div style="font-size:11px;color:#6f6488;margin-top:2px;line-height:1.4;">${p.sub}</div>
          </div>`;
        }).join('')}
      </div>

      <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6f6488;margin:0 0 14px;">Roadmap</h3>
  `;

  for (const phase of ROADMAP) {
    const col = STATUS_COLOR[phase.status];
    html += `
      <div style="margin-bottom:14px;background:${STATUS_BG[phase.status]};border:1px solid ${col}22;border-radius:12px;padding:14px 18px;">
        <div style="font-weight:700;font-size:13px;color:${col};margin-bottom:10px;">${phase.phase}</div>
        <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;">
          ${phase.items.map(item => {
            const done = phase.status === 'done';
            return `<li style="font-size:12px;color:${done ? '#6f6488' : '#c8c0d8'};display:flex;gap:7px;align-items:flex-start;">
              <span style="color:${col};flex-shrink:0;margin-top:1px;">${done ? '✓' : '·'}</span>
              <span style="${done ? 'text-decoration:line-through;' : ''}">${item}</span>
            </li>`;
          }).join('')}
        </ul>
      </div>`;
  }

  html += '</div>';

  if (user) {
    html += `
      <div style="margin-bottom:24px;padding:14px 18px;background:#0e0820;border:1px solid #1d1330;border-radius:12px;display:flex;align-items:center;gap:14px;">
        ${user.picture
          ? `<img src="${user.picture}" style="width:38px;height:38px;border-radius:50%;" />`
          : `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#00d4c8,#d4a200);display:flex;align-items:center;justify-content:center;font-size:17px;">✋</div>`}
        <div>
          <div style="font-weight:600;color:#e8e0f0;font-size:13px;">${user.name || user.email}</div>
          <div style="font-size:11px;color:#6f6488;">${user.email} · ${user.role}</div>
        </div>
        ${user.role === 'admin' ? `<span style="margin-left:auto;background:#1d1330;color:#00d4c8;font-size:10px;padding:2px 8px;border-radius:6px;">arm</span>` : ''}
      </div>`;
  }

  content.innerHTML = html;
  bindChannelCard();
}

// ── Exports ───────────────────────────────────────────────────────────
let initialized = false;

export function initUeber() {
  if (initialized) return;
  initialized = true;
  // Update-Events übernimmt updates.js — kein Duplikat-Banner hier
}

export function activateUeber() { renderRoadmap(); }
export function deactivateUeber() {}
