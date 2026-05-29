import { api } from '../shared/api.js';
import { $, el, toast, formatCell } from '../shared/ui.js';
import { openEditor } from './editor.js';

let lastRows = null;
let mode = 'table';

function renderRowsTable(rows) {
  const thead = $('#query-table thead');
  const tbody = $('#query-table tbody');
  thead.replaceChildren();
  tbody.replaceChildren();

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.append(el('tr', {}, el('td', {}, '— keine Ergebnisse —')));
    return;
  }

  const sample = rows[0];
  if (typeof sample !== 'object' || sample === null) {
    thead.append(el('tr', {}, el('th', {}, 'value')));
    for (const r of rows) tbody.append(el('tr', {}, el('td', {}, String(r))));
    return;
  }

  const keySet = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);
  const keys = ['@rid', '@class', ...Array.from(keySet).filter(k => k !== '@rid' && k !== '@class')];

  thead.append(el('tr', {}, ...keys.map(k => el('th', {}, k))));
  for (const row of rows) {
    const clickable = row && row['@rid'];
    const tr = el('tr', clickable ? { onclick: () => openEditor(row['@rid'], runQuery) } : {});
    for (const k of keys) {
      const { text, cls } = formatCell(row[k]);
      tr.append(el('td', { class: cls, title: typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k] ?? '') }, text));
    }
    tbody.append(tr);
  }
}

function renderJson(rows) {
  $('#query-json').textContent = JSON.stringify(rows, null, 2);
}

function applyView() {
  if (mode === 'json') {
    $('#query-table-wrap').classList.add('hidden');
    $('#query-json').classList.remove('hidden');
    if (lastRows) renderJson(lastRows);
  } else {
    $('#query-json').classList.add('hidden');
    $('#query-table-wrap').classList.remove('hidden');
    if (lastRows) renderRowsTable(lastRows);
  }
}

export async function runQuery() {
  const cmd = $('#query-input').value.trim();
  const lang = $('#query-lang').value;
  if (!cmd) return;
  $('#query-run').disabled = true;
  try {
    const { rows } = await api.query(cmd, lang);
    lastRows = Array.isArray(rows) ? rows : [rows];
    applyView();
    toast(`${lastRows.length} Zeile(n)`, 'ok');
  } catch (e) {
    toast(`Query-Fehler: ${e.message}`, 'fail');
    lastRows = [];
    applyView();
  } finally {
    $('#query-run').disabled = false;
  }
}

export function initQuery() {
  $('#query-run').addEventListener('click', runQuery);
  $('#query-view').addEventListener('click', () => {
    mode = mode === 'table' ? 'json' : 'table';
    applyView();
  });
  $('#query-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });
}
