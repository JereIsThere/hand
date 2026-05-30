import { api } from '../shared/api.js';
import { $, $$, toast } from '../shared/ui.js';
import { loadSchema } from '../features/schema.js';
import { setRecordsClasses, loadRecords } from '../features/records.js';
import { initEditor, openEditorForNew } from '../features/editor.js';
import { initQuery } from '../features/query.js';
import { initWizard, openWizard } from '../features/class-wizard.js';

function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
  history.replaceState(null, '', `#${name}`);
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
    toast(`Verbindung fehlgeschlagen: ${e.message}`, 'fail');
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
    // nach dem Anlegen: Records-Tab + Liste der Klasse neu laden, damit der Eintrag sichtbar wird
    if ($('#panel-records').classList.contains('active') && $('#records-class').value === name) {
      loadRecords();
    } else {
      viewRecordsFor(name);
    }
    refresh();
  });
}

async function bootstrap() {
  initEditor();
  initQuery();
  initWizard();

  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  const initial = (location.hash || '#schema').slice(1);
  if (['schema', 'records', 'query'].includes(initial)) switchTab(initial);

  $('#reload-schema').addEventListener('click', refresh);
  $('#records-load').addEventListener('click', () => loadRecords(true));
  $('#records-class').addEventListener('change', () => loadRecords(true));
  $('#records-new').addEventListener('click', () => {
    const cls = $('#records-class').value;
    if (!cls) { toast('Keine Klasse gewählt', 'fail'); return; }
    newEntryFor(cls);
  });
  $('#open-wizard').addEventListener('click', () => openWizard(lastClasses, refresh));

  await probeConnection();
  await refresh();
}

async function refresh() {
  const classes = await loadSchema({
    onSelectClass: viewRecordsFor,
    onNewEntry: (cls) => newEntryFor(cls.name),
  });
  lastClasses = classes;
  setRecordsClasses(classes);
}

bootstrap();
