import { $, el, toast } from '../shared/ui.js';

async function json(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

const friendsApi = {
  list:    (status) => fetch(`/api/persons${status ? `?status=${encodeURIComponent(status)}` : ''}`).then(json),
  approve: (rid)    => fetch(`/api/persons/${encodeURIComponent(rid)}/approve`, { method: 'POST' }).then(json),
  reject:  (rid)    => fetch(`/api/persons/${encodeURIComponent(rid)}/reject`, { method: 'POST' }).then(json),
};

let pollTimer = null;

const ridOf = (row) => row['@rid'] || row.rid || '';

function statusPill(status) {
  return el('span', { class: `tunnel-status ${status || 'pending'}` }, status || 'pending');
}

function rolePill(role) {
  return el('span', { class: 'source-pill' + (role === 'admin' ? ' managed' : '') }, role || 'friend');
}

function renderRow(row) {
  const rid = ridOf(row);
  const status = row.status || 'pending';
  const actions = [];
  if (status === 'pending') {
    actions.push(el('button', {
      class: 'btn',
      onclick: async () => { try { await friendsApi.approve(rid); toast('freigegeben', 'ok'); refresh(); } catch (e) { toast(e.message, 'fail'); } },
    }, '✓ freigeben'));
    actions.push(el('button', {
      class: 'btn ghost',
      onclick: async () => { try { await friendsApi.reject(rid); toast('abgelehnt', 'ok'); refresh(); } catch (e) { toast(e.message, 'fail'); } },
    }, '✕ ablehnen'));
  } else if (status === 'rejected') {
    actions.push(el('button', {
      class: 'btn ghost',
      onclick: async () => { try { await friendsApi.approve(rid); toast('doch freigegeben', 'ok'); refresh(); } catch (e) { toast(e.message, 'fail'); } },
    }, '↩ doch freigeben'));
  }

  return el('tr', {},
    el('td', {}, statusPill(status)),
    el('td', {}, el('strong', {}, row.name || '—'), el('div', { class: 'muted small' }, row.email || '')),
    el('td', {}, rolePill(row.role)),
    el('td', { class: 'muted small' }, (row.createdAt || '').toString().slice(0, 16) || '—'),
    el('td', { class: 'tunnel-actions' }, ...actions),
  );
}

async function refresh() {
  const filter = $('#friends-filter').value;
  let rows;
  try { ({ rows } = await friendsApi.list(filter)); }
  catch (e) { toast(`Freunde: ${e.message}`, 'fail'); return; }
  const tbody = $('#friends-table tbody');
  tbody.replaceChildren();
  if (!rows.length) {
    tbody.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5 },
      filter ? `niemand mit Status „${filter}"` : 'noch niemand angemeldet')));
  } else {
    for (const r of rows) tbody.append(renderRow(r));
  }
  const pending = rows.filter((r) => (r.status || 'pending') === 'pending').length;
  const dot = $('#friends-dot'); const t = $('#friends-status-text');
  if (dot) dot.classList.toggle('ok', true);
  if (t) t.textContent = `${rows.length} sichtbar · ${pending} wartend`;
}

let initialized = false;

export function initFriends() {
  if (initialized) return;
  initialized = true;
  $('#friends-reload').addEventListener('click', refresh);
  $('#friends-filter').addEventListener('change', refresh);
}

export function activateFriends() {
  refresh();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 5000);
}

export function deactivateFriends() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
