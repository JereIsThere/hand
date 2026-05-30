import { $, $$, el, toast } from '../shared/ui.js';

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

const tunnelsApi = {
  list:   ()        => fetch('/api/tunnels').then(json),
  create: (def)     => fetch('/api/tunnels', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def),
  }).then(json),
  update: (id, def) => fetch(`/api/tunnels/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def),
  }).then(json),
  remove: (id)      => fetch(`/api/tunnels/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json),
  start:  (id)      => fetch(`/api/tunnels/${encodeURIComponent(id)}/start`, { method: 'POST' }).then(json),
  stop:   (id)      => fetch(`/api/tunnels/${encodeURIComponent(id)}/stop`, { method: 'POST' }).then(json),
  log:    (id)      => fetch(`/api/tunnels/${encodeURIComponent(id)}/log`).then(json),
};

let lastList = [];
let selectedId = null;
let pollTimer = null;
let editingId = null;

function renderRow(t) {
  const target = t.user ? `${t.user}@${t.host}:${t.port}` : `${t.host}:${t.port}`;
  const forward = `localhost:${t.localPort} → ${t.remoteHost}:${t.remotePort}`;
  const running = t.status === 'running' || t.status === 'starting';

  const startBtn = el('button', {
    class: 'btn',
    onclick: async () => {
      try { await tunnelsApi.start(t.id); toast(`${t.name}: gestartet`, 'ok'); refresh(); }
      catch (e) { toast(`${t.name}: ${e.message}`, 'fail'); refresh(); }
    },
  }, 'Start');
  const stopBtn = el('button', {
    class: 'btn ghost',
    onclick: async () => {
      try { await tunnelsApi.stop(t.id); toast(`${t.name}: gestoppt`, 'ok'); refresh(); }
      catch (e) { toast(`${t.name}: ${e.message}`, 'fail'); }
    },
  }, 'Stop');
  const editBtn = el('button', {
    class: 'btn ghost',
    disabled: t.managed || running || undefined,
    title: t.managed ? 'managed (aus .env) — nicht editierbar' : (running ? 'erst stoppen' : 'editieren'),
    onclick: () => openTunnelModal(t),
  }, '⚙');
  const delBtn = el('button', {
    class: 'btn ghost',
    disabled: t.managed || undefined,
    title: t.managed ? 'managed (aus .env) — nicht löschbar' : 'löschen',
    onclick: async () => {
      if (!window.confirm(`Tunnel "${t.name}" wirklich löschen?`)) return;
      try { await tunnelsApi.remove(t.id); toast('gelöscht', 'ok'); refresh(); }
      catch (e) { toast(e.message, 'fail'); }
    },
  }, '×');

  const statusPill = el('span', { class: `tunnel-status ${t.status}` }, t.status);
  if (t.error) statusPill.title = t.error;

  const tr = el('tr', {
    class: t.id === selectedId ? 'selected' : '',
    onclick: () => { selectedId = t.id; refresh(); refreshLog(); },
  },
    el('td', {}, running ? '●' : ''),
    el('td', {}, t.name),
    el('td', { class: 'rid-cell' }, target),
    el('td', {}, forward),
    el('td', {}, statusPill),
    el('td', {}, el('span', { class: `source-pill ${t.managed ? 'managed' : ''}` }, t.managed ? '.env' : 'json')),
    el('td', { class: 'tunnel-actions' },
      running ? stopBtn : startBtn,
      editBtn,
      delBtn,
    ),
  );
  return tr;
}

async function refresh() {
  try {
    lastList = await tunnelsApi.list();
  } catch (e) {
    toast(`Tunnels-Fehler: ${e.message}`, 'fail');
    return;
  }
  if (!selectedId && lastList.length > 0) selectedId = lastList[0].id;

  const tbody = $('#tunnels-table tbody');
  tbody.replaceChildren();
  if (lastList.length === 0) {
    tbody.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7 },
      'keine Tunnel konfiguriert — leg einen mit „+ Tunnel" an, oder setze SSH_HOST in .env',
    )));
  } else {
    for (const t of lastList) tbody.append(renderRow(t));
  }

  // Sidebar/Header-Status: wie viele laufen?
  const running = lastList.filter(t => t.status === 'running').length;
  const total = lastList.length;
  const dot = $('#tunnels-dot');
  const text = $('#tunnels-status-text');
  if (dot && text) {
    dot.classList.toggle('ok', running > 0);
    dot.classList.toggle('fail', total > 0 && lastList.some(t => t.status === 'error'));
    text.textContent = total === 0 ? 'keine konfiguriert' : `${running}/${total} aktiv`;
  }
}

async function refreshLog() {
  if (!selectedId) {
    $('#tunnel-log').textContent = '— kein Tunnel gewählt —';
    return;
  }
  try {
    const { log } = await tunnelsApi.log(selectedId);
    $('#tunnel-log').textContent = log.length ? log.join('\n') : '— leer —';
  } catch (e) {
    $('#tunnel-log').textContent = `Fehler: ${e.message}`;
  }
}

function openTunnelModal(existing) {
  editingId = existing?.id || null;
  $('#tunnel-modal-title').textContent = editingId ? `Tunnel: ${existing.name}` : 'Neuer Tunnel';
  $('#tm-name').value       = existing?.name || '';
  $('#tm-host').value       = existing?.host || '';
  $('#tm-user').value       = existing?.user || '';
  $('#tm-port').value       = existing?.port || 22;
  $('#tm-local').value      = existing?.localPort || '';
  $('#tm-remote').value     = existing?.remotePort || '';
  $('#tm-remotehost').value = existing?.remoteHost || 'localhost';
  $('#tm-name').disabled = !!editingId;  // id wird aus name abgeleitet, daher Name beim Editieren fix
  $('#tunnel-modal').classList.add('open');
  $('#tunnel-modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => (editingId ? $('#tm-host') : $('#tm-name')).focus(), 50);
}

function closeTunnelModal() {
  $('#tunnel-modal').classList.remove('open');
  $('#tunnel-modal').setAttribute('aria-hidden', 'true');
  editingId = null;
}

async function saveTunnelModal() {
  const def = {
    name:       $('#tm-name').value.trim(),
    host:       $('#tm-host').value.trim(),
    user:       $('#tm-user').value.trim() || undefined,
    port:       Number($('#tm-port').value) || 22,
    localPort:  Number($('#tm-local').value),
    remotePort: Number($('#tm-remote').value),
    remoteHost: $('#tm-remotehost').value.trim() || 'localhost',
  };
  if (!def.name || !def.host || !def.localPort || !def.remotePort) {
    toast('Name, Host, Local-Port und Remote-Port sind Pflicht', 'fail');
    return;
  }
  try {
    if (editingId) {
      await tunnelsApi.update(editingId, def);
      toast(`${def.name}: gespeichert`, 'ok');
    } else {
      const created = await tunnelsApi.create({ id: def.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'), ...def });
      toast(`${created.name}: angelegt`, 'ok');
      selectedId = created.id;
    }
    closeTunnelModal();
    refresh();
  } catch (e) {
    toast(e.message, 'fail');
  }
}

let initialized = false;

export function initTunnels() {
  if (initialized) return;
  initialized = true;

  $('#tunnel-new').addEventListener('click', () => openTunnelModal(null));
  $('#tunnels-reload').addEventListener('click', () => { refresh(); refreshLog(); });
  $('#tunnel-modal-close').addEventListener('click', closeTunnelModal);
  $('#tunnel-modal-cancel').addEventListener('click', closeTunnelModal);
  $('#tunnel-modal-backdrop').addEventListener('click', closeTunnelModal);
  $('#tunnel-modal-save').addEventListener('click', saveTunnelModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#tunnel-modal').classList.contains('open')) closeTunnelModal();
  });
}

export function activateTunnels() {
  refresh().then(refreshLog);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    refresh();
    if (selectedId) refreshLog();
  }, 3000);
}

export function deactivateTunnels() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
