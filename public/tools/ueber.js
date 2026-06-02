import { $ } from '../shared/ui.js';
import { me } from '../auth/gate.js';

const PLATFORMS = [
  { icon: '🖥️', name: 'Windows',  sub: 'Electron-App + NSIS-Installer + Auto-Update',       status: 'done' },
  { icon: '📱', name: 'Android',  sub: 'PWA via Chrome — installierbar',                      status: 'done' },
  { icon: '🍎', name: 'iOS',      sub: 'PWA via Safari — gebaut, wartet auf HTTPS live',       status: 'active' },
  { icon: '🌐', name: 'Mac',      sub: 'nur Browser (PWA) — kein nativer Build geplant',       status: 'planned' },
  { icon: '🐧', name: 'Linux',    sub: 'nur Browser — AppImage möglich aber kein Bedarf',      status: 'idea' },
];

const ROADMAP = [
  {
    phase: '✅ v0.7 — Fundament',
    status: 'done',
    items: [
      'OrientDB-Admin (Schema, Records, Query)',
      'SSH-Tunnel-Manager',
      'Auge-Submissions + n8n-Build-Workflow',
      'Google-OAuth + Approval-Flow (Freundeskreis)',
      'Vault (AES-256-GCM, GUI + CLI)',
      'AI Shell (Haiku-Analyse, ShellLog)',
      'sprecher (Claude + Grok, Sessions, /image, Streaming)',
      'Setup-Wizard (optionale Keys → Vault)',
      'PWA (Android/iOS installierbar)',
      'Windows-Installer (Electron, NSIS)',
      'Server-Deploy (systemd, nginx, Auto-Deploy CI)',
    ],
  },
  {
    phase: '🚀 v0.8 — Real Use & Feedback',
    status: 'active',
    items: [
      'Profil-Widget + Logout',
      'Einladungslinks (einmalig, direkt approved)',
      'Auto-Update (electron-updater, wie Discord)',
      'sprecher: System-Prompt pro Session, Export',
      'sprecher: Grok-Vision (Bild-Verständnis)',
      'Freunde-Flow end-to-end testen (OrientDB live)',
      'API-Key-Dashboard (Service + Usage-Übersicht)',
      'HTTPS live (certbot) + Login-Durchstich',
    ],
  },
  {
    phase: '📋 v1.0 — Vollständig',
    status: 'planned',
    items: [
      'Command Palette (Ctrl+K, durchsuchbare Aktionen, Links, Webhooks)',
      'Auge: Mini-Artikel-Generator (Submission → n8n → echter Lektion-Entwurf)',
      'sprecher: Video-Kommando (/video → Veo)',
      'arm/hand-Split (Admin-Vollversion vs. casual Freundes-App)',
      'hand: User-Submissions (casual: Themen vorschlagen)',
    ],
  },
  {
    phase: '💡 Ideen (noch offen)',
    status: 'idea',
    items: [
      'Self-Improvement Tool (Feature sandboxed testen, Vergleichs-Modus zwei Modelle)',
      'sprecher in OrientDB (Sessions-Migration von reder)',
      'docker-compose full-stack (auge + OrientDB + n8n + hand)',
      'Code-Signatur für Windows-Installer (SmartScreen-Warnung weg)',
      'reder-Submodule-Cleanup in claude-projects',
    ],
  },
];

const STATUS_COLOR = {
  done:    '#2dd66e',
  active:  '#00d4c8',
  planned: '#9a8fb5',
  idea:    '#6f6488',
};

const STATUS_BG = {
  done:    'rgba(45,214,110,.08)',
  active:  'rgba(0,212,200,.08)',
  planned: 'rgba(154,143,181,.06)',
  idea:    'rgba(111,100,136,.05)',
};

function renderRoadmap() {
  const user = me();
  const content = document.getElementById('ueber-content');
  if (!content) return;

  let html = `
    <div style="margin-bottom:32px;">
      <h2 style="font-family:Georgia,serif;font-size:22px;color:#e8e0f0;margin-bottom:8px;">Die Hand</h2>
      <h3 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#9a8fb5;margin-bottom:12px;">Plattformen</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:32px;">
        ${PLATFORMS.map(p => {
          const col = STATUS_COLOR[p.status];
          const bg  = STATUS_BG[p.status];
          const dot = p.status === 'done' ? '✓' : p.status === 'active' ? '◑' : p.status === 'planned' ? '·' : '○';
          return `<div style="background:${bg};border:1px solid ${col}33;border-radius:10px;padding:12px 14px;">
            <div style="font-size:18px;margin-bottom:4px;">${p.icon}</div>
            <div style="font-size:13px;font-weight:700;color:${col};display:flex;align-items:center;gap:6px;">
              <span>${dot}</span>${p.name}
            </div>
            <div style="font-size:11px;color:#6f6488;margin-top:3px;line-height:1.5;">${p.sub}</div>
          </div>`;
        }).join('')}
      </div>
      <h3 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#9a8fb5;margin-bottom:16px;">Roadmap</h3>
  `;

  for (const phase of ROADMAP) {
    const col = STATUS_COLOR[phase.status];
    const bg  = STATUS_BG[phase.status];
    html += `
      <div style="margin-bottom:20px;background:${bg};border:1px solid ${col}22;border-radius:12px;padding:16px 20px;">
        <div style="font-weight:700;font-size:14px;color:${col};margin-bottom:12px;">${phase.phase}</div>
        <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;">
    `;
    for (const item of phase.items) {
      const done = phase.status === 'done';
      html += `<li style="font-size:13px;color:${done ? '#6f6488' : '#c8c0d8'};display:flex;gap:8px;align-items:flex-start;">
        <span style="color:${col};flex-shrink:0;margin-top:1px;">${done ? '✓' : '·'}</span>
        <span style="${done ? 'text-decoration:line-through;' : ''}">${item}</span>
      </li>`;
    }
    html += `</ul></div>`;
  }

  html += `</div>`;

  // Profil-Karte
  if (user) {
    html += `
      <div style="margin-bottom:32px;padding:16px 20px;background:#0e0820;border:1px solid #1d1330;border-radius:12px;display:flex;align-items:center;gap:14px;">
        ${user.picture ? `<img src="${user.picture}" style="width:40px;height:40px;border-radius:50%;" />` : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4c8,#d4a200);display:flex;align-items:center;justify-content:center;font-size:18px;">✋</div>`}
        <div>
          <div style="font-weight:600;color:#e8e0f0;">${user.name || user.email}</div>
          <div style="font-size:12px;color:#6f6488;">${user.email} · ${user.role}</div>
        </div>
        ${user.role === 'admin' ? `<span style="margin-left:auto;background:#1d1330;color:#00d4c8;font-size:11px;padding:3px 8px;border-radius:6px;">arm</span>` : ''}
      </div>
    `;
  }

  // Links
  html += `
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <a href="https://github.com/JereIsThere/hand" target="_blank"
         style="color:#9a8fb5;font-size:13px;text-decoration:none;">GitHub →</a>
      <a href="https://github.com/JereIsThere/hand/releases" target="_blank"
         style="color:#9a8fb5;font-size:13px;text-decoration:none;">Releases →</a>
      <a href="https://github.com/JereIsThere/auge-framework" target="_blank"
         style="color:#9a8fb5;font-size:13px;text-decoration:none;">auge-framework →</a>
    </div>
  `;

  content.innerHTML = html;
}

function initUpdateListener() {
  if (!window.electronAPI) return; // nur in Electron
  window.electronAPI.onUpdateStatus((ev, info) => {
    let banner = document.getElementById('update-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'update-banner';
      banner.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#0e0820;border:1px solid #00d4c8;' +
        'border-radius:10px;padding:12px 16px;font-size:13px;color:#e8e0f0;z-index:9999;' +
        'display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);max-width:320px;';
      document.body.append(banner);
    }
    if (info.status === 'available') {
      banner.innerHTML = `<span>🔄 v${info.version} verfügbar — wird geladen…</span>`;
    } else if (info.status === 'downloading') {
      banner.innerHTML = `<span>⬇️ Update ${info.percent}%</span><div style="flex:1;height:4px;background:#1d1330;border-radius:2px;"><div style="width:${info.percent}%;height:100%;background:linear-gradient(90deg,#00d4c8,#d4a200);border-radius:2px;"></div></div>`;
    } else if (info.status === 'ready') {
      banner.innerHTML = `<span>✅ v${info.version} bereit</span><button onclick="window.electronAPI.installNow()" style="background:linear-gradient(90deg,#00d4c8,#d4a200);border:none;color:#06000e;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">jetzt neu starten</button><button onclick="this.closest('#update-banner').remove()" style="background:none;border:none;color:#6f6488;cursor:pointer;font-size:18px;">×</button>`;
    } else if (info.status === 'error') {
      banner.innerHTML = `<span style="color:#ff8080">Update-Fehler: ${info.message}</span><button onclick="this.closest('#update-banner').remove()" style="background:none;border:none;color:#6f6488;cursor:pointer;">×</button>`;
    }
  });
}

let initialized = false;

export function initUeber() {
  if (initialized) return;
  initialized = true;
  initUpdateListener();
}

export function activateUeber() {
  renderRoadmap();
}

export function deactivateUeber() {}
