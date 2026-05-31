import { api } from '../shared/api.js';
import { $, $$, toast } from '../shared/ui.js';
import { loadSchema } from '../features/schema.js';
import { setRecordsClasses, loadRecords } from '../features/records.js';
import { initEditor, openEditorForNew } from '../features/editor.js';
import { initQuery } from '../features/query.js';
import { initWizard, openWizard } from '../features/class-wizard.js';
import { initTunnels, activateTunnels, deactivateTunnels } from '../tools/tunnels.js';
import { initEmbeds, activateEmbed } from '../tools/embed.js';

// ----------------------------------------------------------------
// Shell: sidebar tool-switching
// ----------------------------------------------------------------
const TOOLS = ['orientdb', 'tunnels', 'projects', 'funkner'];

function switchTool(name) {
  if (!TOOLS.includes(name)) name = 'orientdb';
  $$('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
  $$('.tool').forEach(t => t.classList.toggle('active', t.id === `tool-${name}`));
  history.replaceState(null, '', `#${name}`);
  if (name === 'tunnels') activateTunnels();
  else                    deactivateTunnels();
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
async function bootstrap() {
  // shared overlays (editor + wizard) initialisieren — sind tool-übergreifend nutzbar
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

  // Tunnels-internal listeners
  initTunnels();

  // External embed tools
  initEmbeds();

  // Shell-Switching
  $$('.sb-item').forEach(b => b.addEventListener('click', () => switchTool(b.dataset.tool)));
  const initialTool = (location.hash || '#orientdb').slice(1);
  switchTool(initialTool);

  // initial loads
  await probeConnection();
  await refreshOrientdb();
}

bootstrap();
