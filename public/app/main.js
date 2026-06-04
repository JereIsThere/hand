import { api } from '../shared/api.js';
import { $, $$, toast } from '../shared/ui.js';
import { loadSchema } from '../features/schema.js';
import { setRecordsClasses, loadRecords } from '../features/records.js';
import { initEditor, openEditorForNew } from '../features/editor.js';
import { initQuery } from '../features/query.js';
import { initWizard, openWizard } from '../features/class-wizard.js';
import { initTunnels, activateTunnels, deactivateTunnels } from '../tools/tunnels.js';
import { initSubmissions, activateSubmissions, deactivateSubmissions } from '../tools/submissions.js';
import { initFriends, activateFriends, deactivateFriends } from '../tools/friends.js';
import { initVaultUi, activateVaultUi, deactivateVaultUi } from '../tools/vault-ui.js';
import { initSprecher, activateSprecher, deactivateSprecher } from '../tools/sprecher.js';
import { initUeber, activateUeber, deactivateUeber } from '../tools/ueber.js';
import { initEmbeds, activateEmbed } from '../tools/embed.js';
import { initAuth, isAdmin, me } from '../auth/gate.js';
import { checkAndShowSetupWizard, initSetupButton } from '../auth/setup.js';

// ----------------------------------------------------------------
// Shell: sidebar tool-switching
// ----------------------------------------------------------------
const TOOLS = ['orientdb', 'tunnels', 'submissions', 'vault', 'friends', 'projects', 'funkner', 'sprecher', 'ueber', 'willkommen'];

function switchTool(name) {
  const fallback = isAdmin() ? 'orientdb' : 'willkommen';
  if (!TOOLS.includes(name)) name = fallback;
  // Nicht-Admins dürfen nur Nicht-Admin-Tools sehen.
  const item = document.querySelector(`.sb-item[data-tool="${name}"]`);
  if (!isAdmin() && item && item.dataset.role === 'admin') name = fallback;

  $$('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
  $$('.tool').forEach(t => t.classList.toggle('active', t.id === `tool-${name}`));
  history.replaceState(null, '', `#${name}`);
  if (name === 'tunnels') activateTunnels();
  else                    deactivateTunnels();
  if (name === 'submissions') activateSubmissions();
  else                        deactivateSubmissions();
  if (name === 'sprecher') activateSprecher();
  else                     deactivateSprecher();
  if (name === 'ueber')   activateUeber();
  else                    deactivateUeber();
  if (name === 'vault')   activateVaultUi();
  else                    deactivateVaultUi();
  if (name === 'friends') activateFriends();
  else                    deactivateFriends();
  if (name === 'projects' || name === 'funkner') activateEmbed(name);
}

// ----------------------------------------------------------------
// OrientDB tool — internal Schema/Records/Query tabs
// ----------------------------------------------------------------
function switchTab(name) {
  $$('#tool-orientdb .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('#tool-orientdb .panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
}

async function probeConnection() {
  const dot = $('#status-dot');
  const text = $('#status-text');
  try {
    const info = await api.info();
    dot.classList.add('ok'); dot.classList.remove('fail');
    text.textContent = `${info.db} · ${info.classes} Klassen`;
    return info;
  } catch (e) {
    dot.classList.add('fail'); dot.classList.remove('ok');
    text.textContent = 'nicht verbunden';
    toast(`OrientDB: ${e.message}`, 'fail');
    return null;
  }
}

let lastClasses = [];

function classDefByName(name) {
  return lastClasses.find(c => c.name === name) || null;
}

function viewRecordsFor(name) {
  switchTab('records');
  const sel = $('#records-class');
  if (sel.value !== name) sel.value = name;
  $('#records-skip').value = 0;
  loadRecords(true);
}

function newEntryFor(name) {
  const def = classDefByName(name);
  if (!def) { toast(`Klasse "${name}" unbekannt`, 'fail'); return; }
  openEditorForNew(name, def, () => {
    if ($('#panel-records').classList.contains('active') && $('#records-class').value === name) {
      loadRecords();
    } else {
      viewRecordsFor(name);
    }
    refreshOrientdb();
  });
}

async function refreshOrientdb() {
  const classes = await loadSchema({
    onSelectClass: viewRecordsFor,
    onNewEntry: (cls) => newEntryFor(cls.name),
  });
  lastClasses = classes;
  setRecordsClasses(classes);
}

// ----------------------------------------------------------------
// Bootstrap
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// Profil-Menü (Popup wie bei Claude)
// ----------------------------------------------------------------
function setupProfileMenu(user) {
  const widget = document.getElementById('profile-widget');
  if (!widget) return;

  // Den inline ⏏-Button entfernen — Logout lebt jetzt im Menü
  document.getElementById('profile-logout')?.remove();
  widget.style.cursor = 'pointer';
  widget.title = 'Profil';

  const esc = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const avatar = user?.picture
    ? `<img src="${user.picture}" style="width:36px;height:36px;border-radius:50%;" />`
    : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00d4c8,#d4a200);display:flex;align-items:center;justify-content:center;font-size:16px;">${esc((user?.name || user?.email || '?')[0]?.toUpperCase())}</div>`;

  const menu = document.createElement('div');
  menu.id = 'profile-menu';
  menu.style.cssText = 'position:fixed;z-index:5000;display:none;min-width:240px;background:#0e0820;' +
    'border:1px solid #2a1d44;border-radius:14px;padding:8px;box-shadow:0 12px 48px rgba(0,0,0,.6);';
  menu.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 10px 12px;border-bottom:1px solid #1d1330;margin-bottom:6px;">
      ${avatar}
      <div style="min-width:0;flex:1;">
        <div style="font-size:13px;font-weight:600;color:#e8e0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(user?.name || 'Nutzer')}</div>
        <div style="font-size:11px;color:#6f6488;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(user?.email || '')}</div>
        <div style="font-size:10px;color:#00d4c8;margin-top:2px;">${user?.role === 'admin' ? 'arm · admin' : 'freund'}</div>
      </div>
    </div>
    <button class="pm-item" data-act="ueber">📍 <span>Über / Roadmap</span></button>
    <button class="pm-item" data-act="settings">⚙️ <span>Einstellungen</span></button>
    <div style="height:1px;background:#1d1330;margin:6px 4px;"></div>
    <button class="pm-item" data-act="logout" style="color:#ff8080;">⏏ <span>Abmelden</span></button>
  `;
  // Item-Styling
  const style = document.createElement('style');
  style.textContent = '.pm-item{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;' +
    'color:#c8c0d8;font-size:13px;text-align:left;padding:9px 10px;border-radius:8px;cursor:pointer;font-family:inherit;}' +
    '.pm-item:hover{background:#1d1330;color:#e8e0f0;}';
  document.head.append(style);
  document.body.append(menu);

  function position() {
    const r = widget.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  }
  function open()  { position(); menu.style.display = 'block'; }
  function close() { menu.style.display = 'none'; }
  function toggle() { menu.style.display === 'block' ? close() : open(); }

  widget.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !widget.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  menu.querySelectorAll('.pm-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      close();
      if (act === 'ueber') switchTool('ueber');
      else if (act === 'settings') checkAndShowSetupWizard(true);
      else if (act === 'logout') {
        await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
        location.href = '/';
      }
    });
  });
}

function applyRole() {
  if (isAdmin()) return;
  // Freunde sehen keine Admin-Tools.
  $$('[data-role="admin"]').forEach((e) => { e.style.display = 'none'; });
}

async function bootstrap() {
  // Auth zuerst: bei Login/Pending wird ein Overlay gezeigt und wir booten nicht.
  const gate = await initAuth();
  if (!gate.ok) return;

  applyRole();

  // Shell-Switching (immer)
  $$('.sb-item').forEach(b => b.addEventListener('click', () => switchTool(b.dataset.tool)));

  initSetupButton();
  initUeber();

  // Profil-Widget
  const user = me();
  if (user) {
    const nameEl = document.getElementById('profile-name');
    const roleEl = document.getElementById('profile-role');
    const avatarEl = document.getElementById('profile-avatar');
    if (nameEl) nameEl.textContent = user.name || user.email || 'Nutzer';
    if (roleEl) roleEl.textContent = user.role === 'admin' ? 'arm · admin' : 'freund';
    if (avatarEl && user.picture) {
      avatarEl.innerHTML = `<img src="${user.picture}" style="width:28px;height:28px;border-radius:50%;" />`;
    } else if (avatarEl) {
      avatarEl.textContent = (user.name || user.email || '?')[0].toUpperCase();
    }
  }
  const footLabel = document.getElementById('sidebar-foot-label');
  if (footLabel) {
    fetch('/api/version').then(r => r.json()).then(({ version }) => {
      footLabel.textContent = `v${version} · hand.jeremias-groehl.de`;
    }).catch(() => {
      footLabel.textContent = 'hand.jeremias-groehl.de';
    });
  }
  setupProfileMenu(user);

  if (isAdmin()) {
    // Setup-Wizard beim ersten Start wenn Keys fehlen
    checkAndShowSetupWizard();

    // shared overlays (editor + wizard) — tool-übergreifend
    initEditor();
    initWizard();

    // OrientDB-internal listeners
    initQuery();
    $$('#tool-orientdb .tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('#reload-schema').addEventListener('click', refreshOrientdb);
    $('#records-load').addEventListener('click', () => loadRecords(true));
    $('#records-class').addEventListener('change', () => loadRecords(true));
    $('#records-new').addEventListener('click', () => {
      const cls = $('#records-class').value;
      if (!cls) { toast('Keine Klasse gewählt', 'fail'); return; }
      newEntryFor(cls);
    });
    $('#open-wizard').addEventListener('click', () => openWizard(lastClasses, refreshOrientdb));

    initTunnels();
    initSubmissions();
    initVaultUi();
    initSprecher();
    initFriends();
    initEmbeds();

    const initialTool = (location.hash || '#orientdb').slice(1);
    switchTool(initialTool);

    await probeConnection();
    await refreshOrientdb();
  } else {
    // Freunde: sprecher + Willkommen
    initSprecher();
    switchTool('sprecher');
  }
}

bootstrap();
