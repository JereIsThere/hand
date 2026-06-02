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
  createInvite: (note, role) => fetch('/api/invites', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ note, role }),
  }).then(json),
  listInvites: () => fetch('/api/invites').then(json),
  deleteInvite: (token) => fetch(`/api/invites/${encodeURIComponent(token)}`, { method: 'DELETE' }).then(json),
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

async function createInvite() {
  const note = prompt('Notiz (z.B. Name des Freundes):') ?? '';
  try {
    const { url, role, expiresAt } = await friendsApi.createInvite(note, 'friend');
    await navigator.clipboard.writeText(url).catch(() => {});
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(6,0,14,.9);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `<div style="background:#0e0820;border:1px solid #1d1330;border-radius:14px;padding:24px;max-width:520px;width:100%;">
      <div style="font-size:13px;color:#9a8fb5;margin-bottom:8px;">✉️ Einladungslink — ${role}, gültig bis ${String(expiresAt).slice(0,10)}</div>
      <div style="background:#06000e;border:1px solid #2a1d44;border-radius:8px;padding:10px 12px;font-family:monospace;font-size:12px;color:#00d4c8;word-break:break-all;margin-bottom:12px;">${url}</div>
      <div style="font-size:12px;color:#6f6488;margin-bottom:16px;">Einmalig. Nach Google-Login direkt freigegeben — kein Pending, kein manuelles Genehmigen.</div>
      <button style="background:linear-gradient(90deg,#00d4c8,#d4a200);border:none;color:#06000e;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer;" onclick="navigator.clipboard.writeText('${url}');this.textContent='✓ kopiert'">kopieren</button>
      <button style="background:none;border:1px solid #2a1d44;color:#9a8fb5;padding:8px 16px;border-radius:8px;cursor:pointer;margin-left:8px;" onclick="this.closest('[style]').remove()">schließen</button>
    </div>`;
    document.body.append(overlay);
  } catch(e) { toast(e.message, 'fail'); }
}

export function initFriends() {
  if (initialized) return;
  initialized = true;
  $('#friends-reload').addEventListener('click', refresh);
  $('#friends-filter').addEventListener('change', refresh);
  document.getElementById('friends-invite-btn')?.addEventListener('click', createInvite);
}

export function activateFriends() {
  refresh();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 5000);
}

export function deactivateFriends() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
