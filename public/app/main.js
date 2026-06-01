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
import { initEmbeds, activateEmbed } from '../tools/embed.js';
import { initAuth, isAdmin } from '../auth/gate.js';

// ----------------------------------------------------------------
// Shell: sidebar tool-switching
// ----------------------------------------------------------------
const TOOLS = ['orientdb', 'tunnels', 'submissions', 'vault', 'friends', 'projects', 'funkner', 'willkommen'];

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

  if (isAdmin()) {
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
    initFriends();
    initEmbeds();

    const initialTool = (location.hash || '#orientdb').slice(1);
    switchTool(initialTool);

    await probeConnection();
    await refreshOrientdb();
  } else {
    // Freund: nur die Willkommen-Ansicht (bis casual Tools wie sprecher kommen).
    switchTool('willkommen');
  }
}

bootstrap();
