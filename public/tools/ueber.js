import { $ } from '../shared/ui.js';
import { me } from '../auth/gate.js';

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
      'Profil-Widget + Logout (← gerade gebaut)',
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
      <p style="color:#9a8fb5;font-size:14px;line-height:1.7;max-width:560px;">
        Tool-Shell für den Freundeskreis. Gebaut von Jere mit Claude/Egon.
        Vollständig vibecoded — lies die
        <a href="https://github.com/JereIsThere/hand/releases/tag/v0.7.0" target="_blank"
           style="color:#00d4c8;">Release Notes</a> für Egons ehrliche Vorbemerkung.
      </p>
    </div>
    <div style="margin-bottom:32px;">
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

let initialized = false;

export function initUeber() {
  if (initialized) return;
  initialized = true;
}

export function activateUeber() {
  renderRoadmap();
}

export function deactivateUeber() {}
