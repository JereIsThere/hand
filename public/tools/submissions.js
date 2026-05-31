import { $, el, toast } from '../shared/ui.js';

async function json(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.error) || (typeof data === 'string' ? data : `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

const subsApi = {
  list:    (status) => fetch(`/api/submissions${status ? `?status=${encodeURIComponent(status)}` : ''}`).then(json),
  create:  (body)   => fetch('/api/submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json),
  approve: (rid)    => fetch(`/api/submissions/${encodeURIComponent(rid)}/approve`, { method: 'POST' }).then(json),
  reject:  (rid, grund) => fetch(`/api/submissions/${encodeURIComponent(rid)}/reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grund }),
  }).then(json),
};

let pollTimer = null;

function ridOf(row) {
  return row['@rid'] || row.rid || '';
}

function statusPill(status) {
  return el('span', { class: `tunnel-status ${status || 'pending'}` }, status || 'pending');
}

function renderRow(row) {
  const rid = ridOf(row);
  const status = row.status || 'pending';
  const created = (row.createdAt || '').toString().slice(0, 16);

  const actions = [];
  if (status === 'pending') {
    actions.push(el('button', {
      class: 'btn',
      onclick: async () => {
        try {
          const r = await subsApi.approve(rid);
          const b = r.build || {};
          toast(b.triggered ? 'genehmigt · n8n-Build getriggert' : `genehmigt · Build nicht getriggert (${b.reason || b.status || '—'})`, b.triggered ? 'ok' : '');
          refresh();
        } catch (e) { toast(e.message, 'fail'); }
      },
    }, '✓ genehmigen'));
    actions.push(el('button', {
      class: 'btn ghost',
      onclick: async () => {
        const grund = window.prompt('Ablehnungsgrund (optional):', '') ?? null;
        try { await subsApi.reject(rid, grund); toast('abgelehnt', 'ok'); refresh(); }
        catch (e) { toast(e.message, 'fail'); }
      },
    }, '✕ ablehnen'));
  } else if (row.buildRef) {
    actions.push(el('a', { class: 'btn ghost', href: row.buildRef, target: '_blank', rel: 'noopener' }, '↗ Build'));
  }

  const tr = el('tr', {},
    el('td', {}, statusPill(status)),
    el('td', {}, el('strong', {}, row.titel || '—'),
      row.beschreibung ? el('div', { class: 'muted small' }, row.beschreibung) : null),
    el('td', { class: 'rid-cell' }, row.slug || '—'),
    el('td', {}, row.kategorie || '—'),
    el('td', {}, row.vorgeschlagenVon || '—'),
    el('td', { class: 'muted small' }, created || '—'),
    el('td', { class: 'tunnel-actions' }, ...actions),
  );
  return tr;
}

async function refresh() {
  const filter = $('#subs-filter').value;
  let rows;
  try {
    ({ rows } = await subsApi.list(filter));
  } catch (e) {
    setStatus(false, e.message);
    toast(`Submissions: ${e.message}`, 'fail');
    return;
  }
  const tbody = $('#subs-table tbody');
  tbody.replaceChildren();
  if (!rows.length) {
    tbody.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7 },
      filter ? `keine Submissions mit Status „${filter}"` : 'noch keine Submissions',
    )));
  } else {
    for (const r of rows) tbody.append(renderRow(r));
  }
  const pending = rows.filter(r => (r.status || 'pending') === 'pending').length;
  setStatus(true, `${rows.length} sichtbar · ${pending} offen`);
}

function setStatus(ok, text) {
  const dot = $('#subs-dot');
  const t = $('#subs-status-text');
  if (dot) { dot.classList.toggle('ok', !!ok); dot.classList.toggle('fail', !ok); }
  if (t) t.textContent = text;
}

function openModal() {
  for (const id of ['sm-titel', 'sm-slug', 'sm-kategorie', 'sm-beschreibung', 'sm-von']) $(`#${id}`).value = '';
  $('#subs-modal').classList.add('open');
  $('#subs-modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#sm-titel').focus(), 50);
}

function closeModal() {
  $('#subs-modal').classList.remove('open');
  $('#subs-modal').setAttribute('aria-hidden', 'true');
}

// Slug aus Titel ableiten, solange der Slug nicht von Hand angefasst wurde.
function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[äöü]/g, m => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[m]))
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function save() {
  const body = {
    titel: $('#sm-titel').value.trim(),
    slug: $('#sm-slug').value.trim() || slugify($('#sm-titel').value),
    kategorie: $('#sm-kategorie').value.trim(),
    beschreibung: $('#sm-beschreibung').value.trim(),
    vorgeschlagenVon: $('#sm-von').value.trim(),
  };
  if (!body.titel || !body.slug) { toast('Titel (und Slug) sind Pflicht', 'fail'); return; }
  try {
    await subsApi.create(body);
    toast('Vorschlag eingereicht', 'ok');
    closeModal();
    refresh();
  } catch (e) { toast(e.message, 'fail'); }
}

let initialized = false;

export function initSubmissions() {
  if (initialized) return;
  initialized = true;

  $('#subs-reload').addEventListener('click', refresh);
  $('#subs-filter').addEventListener('change', refresh);
  $('#subs-new').addEventListener('click', openModal);
  $('#subs-modal-close').addEventListener('click', closeModal);
  $('#subs-modal-cancel').addEventListener('click', closeModal);
  $('#subs-modal-backdrop').addEventListener('click', closeModal);
  $('#subs-modal-save').addEventListener('click', save);

  // Slug-Autofill aus Titel
  let slugTouched = false;
  $('#sm-slug').addEventListener('input', () => { slugTouched = true; });
  $('#sm-titel').addEventListener('input', () => {
    if (!slugTouched) $('#sm-slug').value = slugify($('#sm-titel').value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#subs-modal').classList.contains('open')) closeModal();
  });
}

export function activateSubmissions() {
  refresh();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 5000);
}

export function deactivateSubmissions() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
