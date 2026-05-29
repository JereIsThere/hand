import { api } from '../shared/api.js';
import { $, el, toast, formatCell, isMeta } from '../shared/ui.js';
import { openEditor } from './editor.js';

const state = { class: null, limit: 50, skip: 0 };

export function setRecordsClasses(classes) {
  const sel = $('#records-class');
  const previous = sel.value;
  sel.replaceChildren(...classes.map(c =>
    el('option', { value: c.name }, c.name)
  ));
  if (classes.find(c => c.name === previous)) sel.value = previous;
}

export async function loadRecords(reset = false) {
  const cls = $('#records-class').value;
  if (!cls) return;
  state.class = cls;
  state.limit = Math.max(1, Math.min(500, Number($('#records-limit').value) || 50));
  state.skip = reset ? 0 : Math.max(0, Number($('#records-skip').value) || 0);
  $('#records-skip').value = state.skip;
  $('#records-meta').textContent = 'lade…';

  try {
    const [{ rows }, { count }] = await Promise.all([
      api.records(cls, { limit: state.limit, skip: state.skip }),
      api.count(cls).catch(() => ({ count: '?' })),
    ]);
    renderTable(rows);
    $('#records-meta').textContent =
      `${rows.length} von ${count} · skip ${state.skip} · limit ${state.limit}`;
  } catch (e) {
    $('#records-meta').textContent = '';
    toast(`Records-Fehler: ${e.message}`, 'fail');
  }
}

function renderTable(rows) {
  const thead = $('#records-table thead');
  const tbody = $('#records-table tbody');
  thead.replaceChildren();
  tbody.replaceChildren();

  if (!rows.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 1 }, '— leer —')));
    return;
  }

  const keySet = new Set(['@rid']);
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (k === '@rid' || k === '@type' || k === '@version' || k === '@fieldTypes') continue;
      keySet.add(k);
    }
  }
  const keys = ['@rid', '@class', ...Array.from(keySet).filter(k => k !== '@rid' && k !== '@class')];

  thead.append(el('tr', {}, ...keys.map(k => el('th', {}, k))));

  for (const row of rows) {
    const tr = el('tr', { onclick: () => openEditor(row['@rid'], () => loadRecords()) });
    for (const k of keys) {
      const { text, cls } = formatCell(row[k]);
      tr.append(el('td', { class: cls, title: typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k] ?? '') }, text));
    }
    tbody.append(tr);
  }
}

export function pageRecords(direction) {
  const limit = Number($('#records-limit').value) || 50;
  const skip = Number($('#records-skip').value) || 0;
  $('#records-skip').value = Math.max(0, skip + direction * limit);
  loadRecords();
}

export { isMeta };
