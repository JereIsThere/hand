import { api } from '../shared/api.js';
import { $, $$, toast } from '../shared/ui.js';
import { loadSchema } from '../features/schema.js';
import { setRecordsClasses, loadRecords } from '../features/records.js';
import { initEditor } from '../features/editor.js';
import { initQuery } from '../features/query.js';

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

async function bootstrap() {
  initEditor();
  initQuery();

  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  const initial = (location.hash || '#schema').slice(1);
  if (['schema', 'records', 'query'].includes(initial)) switchTab(initial);

  $('#reload-schema').addEventListener('click', refresh);
  $('#records-load').addEventListener('click', () => loadRecords(true));
  $('#records-class').addEventListener('change', () => loadRecords(true));

  await probeConnection();
  await refresh();
}

async function refresh() {
  const classes = await loadSchema();
  setRecordsClasses(classes);
}

bootstrap();
