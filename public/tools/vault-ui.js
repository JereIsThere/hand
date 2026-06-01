import { $, el, toast } from '../shared/ui.js';

async function json(res) {
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const vaultApi = {
  list:   ()            => fetch('/api/vault').then(json),
  get:    (name, rev)   => fetch(`/api/vault/${encodeURIComponent(name)}${rev ? '?reveal=1' : ''}`).then(json),
  set:    (name, body)  => fetch(`/api/vault/${encodeURIComponent(name)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json),
  del:    (name)        => fetch(`/api/vault/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(json),
};

let allSecrets = [];
let editingName = null;
let revealed = false;

// ── Tabelle ───────────────────────────────────────────────────────────
function renderRow(s) {
  const updated = (s.updatedAt || '').toString().slice(0, 10);
  const copyBtn = el('button', {
    class: 'btn ghost', title: 'Wert kopieren',
    onclick: async () => {
      try {
        const full = await vaultApi.get(s.name, true);
        await navigator.clipboard.writeText(full.value || '');
        toast(`${s.name} kopiert`, 'ok');
      } catch (e) { toast(e.message, 'fail'); }
    },
  }, '⧉');
  const editBtn = el('button', {
    class: 'btn ghost',
    onclick: () => openModal(s),
  }, '⚙');

  return el('tr', {},
    el('td', {}, el('code', { style: 'font-size:13px;color:var(--accent)' }, s.name)),
    el('td', {}, s.service || '—'),
    el('td', { class: 'muted small' }, s.description || ''),
    el('td', { class: 'muted small' }, updated || '—'),
    el('td', { class: 'tunnel-actions' }, copyBtn, editBtn),
  );
}

function filterAndRender(query) {
  const q = (query || '').toLowerCase();
  const filtered = q
    ? allSecrets.filter(s => s.name.toLowerCase().includes(q) || (s.service || '').toLowerCase().includes(q))
    : allSecrets;
  const tbody = $('#vault-table tbody');
  tbody.replaceChildren();
  if (!filtered.length) {
    tbody.append(el('tr', { class: 'empty-row' },
      el('td', { colspan: 5 }, q ? `keine Treffer für „${q}"` : 'Vault ist leer — leg ein Secret an.')));
  } else {
    for (const s of filtered) tbody.append(renderRow(s));
  }
}

async function refresh() {
  try {
    const { secrets } = await vaultApi.list();
    allSecrets = secrets || [];
  } catch (e) {
    const dot = $('#vault-dot'); if (dot) { dot.classList.add('fail'); dot.classList.remove('ok'); }
    const t = $('#vault-status-text'); if (t) t.textContent = e.message;
    toast(`Vault: ${e.message}`, 'fail');
    return;
  }
  const dot = $('#vault-dot'); if (dot) { dot.classList.add('ok'); dot.classList.remove('fail'); }
  const t = $('#vault-status-text'); if (t) t.textContent = `${allSecrets.length} Secret${allSecrets.length !== 1 ? 's' : ''}`;
  filterAndRender($('#vault-search')?.value);
}

// ── Modal ─────────────────────────────────────────────────────────────
function openModal(existing) {
  editingName = existing?.name || null;
  revealed = false;
  $('#vault-modal-title').textContent = editingName ? `Secret: ${editingName}` : 'Neues Secret';
  $('#vm-name').value       = existing?.name        || '';
  $('#vm-name').disabled    = !!editingName;
  $('#vm-service').value    = existing?.service     || '';
  $('#vm-desc').value       = existing?.description || '';
  $('#vm-value').value      = '';
  $('#vm-value').type       = 'password'; // versteckt by default
  $('#vm-reveal-btn').textContent = '👁 anzeigen';
  $('#vault-modal-delete').classList.toggle('hidden', !editingName);
  $('#vault-modal').classList.add('open');
  $('#vault-modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => (editingName ? $('#vm-service') : $('#vm-name')).focus(), 50);
}

function closeModal() {
  $('#vault-modal').classList.remove('open');
  $('#vault-modal').setAttribute('aria-hidden', 'true');
  editingName = null; revealed = false;
}

async function saveModal() {
  const name  = editingName || $('#vm-name').value.trim();
  const value = $('#vm-value').value;
  if (!name) { toast('Name ist Pflicht', 'fail'); return; }
  // Beim Editieren: leerer Wert = Wert nicht ändern (nur Metadaten updaten)
  if (!value && !editingName) { toast('Wert ist Pflicht', 'fail'); return; }
  const body = {
    service:     $('#vm-service').value.trim() || undefined,
    description: $('#vm-desc').value.trim()    || undefined,
  };
  if (value) body.value = value;
  if (!value && editingName) {
    // nur Metadaten: aktuellen Wert holen und mitschicken
    try {
      const full = await vaultApi.get(editingName, true);
      body.value = full.value;
    } catch (e) { toast(e.message, 'fail'); return; }
  }
  try {
    await vaultApi.set(name, body);
    toast(`${name} gespeichert`, 'ok');
    closeModal();
    refresh();
  } catch (e) { toast(e.message, 'fail'); }
}

async function deleteSecret() {
  if (!editingName) return;
  if (!window.confirm(`Secret „${editingName}" wirklich löschen?`)) return;
  try {
    await vaultApi.del(editingName);
    toast(`${editingName} gelöscht`, 'ok');
    closeModal();
    refresh();
  } catch (e) { toast(e.message, 'fail'); }
}

let initialized = false;

export function initVaultUi() {
  if (initialized) return;
  initialized = true;

  $('#vault-reload').addEventListener('click', refresh);
  $('#vault-new').addEventListener('click', () => openModal(null));
  $('#vault-search').addEventListener('input', (e) => filterAndRender(e.target.value));

  // Reveal-Toggle im Modal
  $('#vm-reveal-btn').addEventListener('click', () => {
    revealed = !revealed;
    const ta = $('#vm-value');
    ta.style.webkitTextSecurity = revealed ? 'none' : 'disc';
    ta.style.fontFamily = revealed ? 'monospace' : 'text-security-disc, monospace';
    // einfacher: type swap (textarea → kein type, also CSS-Trick)
    ta.style.filter = revealed ? 'none' : 'blur(4px)';
    $('#vm-reveal-btn').textContent = revealed ? '🙈 verbergen' : '👁 anzeigen';
  });

  $('#vault-modal-close').addEventListener('click', closeModal);
  $('#vault-modal-cancel').addEventListener('click', closeModal);
  $('#vault-modal-backdrop').addEventListener('click', closeModal);
  $('#vault-modal-save').addEventListener('click', saveModal);
  $('#vault-modal-delete').addEventListener('click', deleteSecret);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#vault-modal').classList.contains('open')) closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey) {
      // Ctrl+K im Vault-Tab öffnet neues Secret
      if (document.querySelector('#tool-vault.active')) { e.preventDefault(); openModal(null); }
    }
  });
}

export function activateVaultUi() { refresh(); }
export function deactivateVaultUi() {}
