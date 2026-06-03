import { $, el, toast } from '../shared/ui.js';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { id: 'openai',    label: 'OpenAI',    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { id: 'gemini',    label: 'Gemini',    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
];

const vaultApi = {
  list:   ()             => fetch('/api/vault').then(r => r.json()),
  set:    (provider, key) => fetch('/api/vault', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key }),
  }).then(r => r.json()),
  remove: (provider)    => fetch(`/api/vault/${encodeURIComponent(provider)}`, { method: 'DELETE' }).then(r => r.json()),
};

let vaultState = {};   // { anthropic: true, openai: false, gemini: true }
const conversation = [];
let mediaQueue = [];
let streaming = false;

// ----------------------------------------------------------------
// Vault tab
// ----------------------------------------------------------------

async function loadVault() {
  const list = await vaultApi.list();
  vaultState = {};
  for (const { provider, set } of list) vaultState[provider] = set;
  renderVaultList();
  updateProviderSelect();
}

function renderVaultList() {
  const container = $('#reder-vault-list');
  container.innerHTML = '';
  for (const p of PROVIDERS) {
    const set = !!vaultState[p.id];
    container.append(el('div', { class: 'vault-row' },
      el('div', { class: 'vault-info' },
        el('strong', {}, p.label),
        el('span', { class: set ? 'vault-set' : 'vault-unset' }, set ? '  gesetzt' : '  nicht gesetzt'),
      ),
      el('div', { class: 'vault-actions' },
        set
          ? el('button', { class: 'btn ghost danger', onclick: () => removeKey(p.id, p.label) }, 'entfernen')
          : '',
        el('button', { class: 'btn ghost', onclick: () => openKeyModal(p.id, p.label) }, set ? 'ändern' : 'eintragen'),
      ),
    ));
  }
}

function openKeyModal(providerId, providerLabel) {
  const modal = $('#reder-key-modal');
  $('#reder-key-modal-title').textContent = `${providerLabel} · API-Key`;
  $('#reder-key-input').value = '';
  modal.dataset.provider = providerId;
  modal.removeAttribute('aria-hidden');
  setTimeout(() => $('#reder-key-input').focus(), 50);
}

async function removeKey(provider, label) {
  if (!confirm(`API-Key für ${label} wirklich entfernen?`)) return;
  try {
    await vaultApi.remove(provider);
    toast(`${label} · Key entfernt`, '');
    await loadVault();
  } catch (e) {
    toast(e.message, 'fail');
  }
}

// ----------------------------------------------------------------
// Chat tab
// ----------------------------------------------------------------

function updateProviderSelect() {
  const sel = $('#reder-provider-sel');
  const prev = sel.value;
  sel.innerHTML = '';
  for (const p of PROVIDERS) {
    if (!vaultState[p.id]) continue;
    sel.append(el('option', { value: p.id }, p.label));
  }
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
  onProviderChange();
}

function onProviderChange() {
  const p = PROVIDERS.find(x => x.id === $('#reder-provider-sel').value);
  const modelSel = $('#reder-model-sel');
  modelSel.innerHTML = '';
  if (!p) return;
  for (const m of p.models) modelSel.append(el('option', { value: m }, m));
}

function renderMsg(msg) {
  const wrap = el('div', { class: `chat-msg ${msg.role}` });
  const mediaParts = msg.content.filter(c => c.type === 'image' || c.type === 'video');
  const textParts  = msg.content.filter(c => c.type === 'text');
  if (mediaParts.length) {
    const mw = el('div', { class: 'chat-media' });
    for (const m of mediaParts) {
      if (m.type === 'image') {
        mw.append(el('img', { src: `data:${m.mimeType};base64,${m.data}`, class: 'chat-img', alt: '' }));
      } else {
        const v = el('video', { class: 'chat-vid', controls: true });
        v.src = `data:${m.mimeType};base64,${m.data}`;
        mw.append(v);
      }
    }
    wrap.append(mw);
  }
  if (textParts.length) {
    const t = el('div', { class: 'chat-text' });
    t.textContent = textParts.map(c => c.text).join('');
    wrap.append(t);
  }
  return wrap;
}

function scrollBottom() {
  const list = $('#reder-chat-list');
  list.scrollTop = list.scrollHeight;
}

async function sendMessage() {
  if (streaming) return;
  const textarea = $('#reder-input');
  const text = textarea.value.trim();
  if (!text && mediaQueue.length === 0) return;

  const provider = $('#reder-provider-sel').value;
  const model    = $('#reder-model-sel').value;
  if (!provider) { toast('Kein Provider mit Key konfiguriert', 'fail'); return; }

  const content = [
    ...mediaQueue.map(f => ({ type: f.mediaType, mimeType: f.type, data: f.b64 })),
    ...(text ? [{ type: 'text', text }] : []),
  ];

  conversation.push({ role: 'user', content });
  mediaQueue = [];
  textarea.value = '';
  updateMediaPreview();

  const list = $('#reder-chat-list');
  list.append(renderMsg(conversation.at(-1)));

  const assistantWrap = el('div', { class: 'chat-msg assistant' });
  const textEl = el('div', { class: 'chat-text streaming' }, '');
  assistantWrap.append(textEl);
  list.append(assistantWrap);
  scrollBottom();

  streaming = true;
  $('#reder-send').disabled = true;
  let fullText = '';

  try {
    const res = await fetch('/api/reder/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, messages: conversation }),
    });

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.error) { toast(evt.error, 'fail'); break; }
          if (evt.delta) {
            fullText += evt.delta;
            textEl.textContent = fullText;
            scrollBottom();
          }
        } catch {}
      }
    }
  } catch (e) {
    toast(e.message, 'fail');
  }

  textEl.classList.remove('streaming');
  streaming = false;
  $('#reder-send').disabled = false;

  if (fullText) {
    conversation.push({ role: 'assistant', content: [{ type: 'text', text: fullText }] });
  }
}

function updateMediaPreview() {
  const preview = $('#reder-media-preview');
  preview.innerHTML = '';
  for (const f of mediaQueue) {
    const thumb = el('div', { class: 'media-thumb' });
    if (f.mediaType === 'image') {
      thumb.append(el('img', { src: `data:${f.type};base64,${f.b64}`, alt: '' }));
    } else {
      thumb.append(el('span', { class: 'media-thumb-label' }, `Datei: ${f.name}`));
    }
    thumb.append(el('button', { class: 'media-remove', onclick: () => {
      mediaQueue = mediaQueue.filter(x => x !== f);
      updateMediaPreview();
    }}, '✕'));
    preview.append(thumb);
  }
}

function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function queueFile(file) {
  const mediaType = file.type.startsWith('video') ? 'video' : 'image';
  const b64 = await fileToB64(file);
  mediaQueue.push({ name: file.name, type: file.type, mediaType, b64 });
  updateMediaPreview();
}

// ----------------------------------------------------------------
// Init
// ----------------------------------------------------------------
export function initReder() {
  // Tab switching inside Reder tool
  document.querySelectorAll('#tool-reder .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tool-reder .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#tool-reder .panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#reder-panel-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Vault init
  loadVault();

  // Key modal
  $('#reder-key-save').addEventListener('click', async () => {
    const modal = $('#reder-key-modal');
    const provider = modal.dataset.provider;
    const key = $('#reder-key-input').value.trim();
    if (!key) { toast('Key darf nicht leer sein', 'fail'); return; }
    try {
      await vaultApi.set(provider, key);
      const label = PROVIDERS.find(p => p.id === provider)?.label || provider;
      toast(`${label} · Key gespeichert`, 'ok');
      modal.setAttribute('aria-hidden', 'true');
      await loadVault();
    } catch (e) {
      toast(e.message, 'fail');
    }
  });
  const closeKeyModal = () => $('#reder-key-modal').setAttribute('aria-hidden', 'true');
  $('#reder-key-cancel').addEventListener('click', closeKeyModal);
  $('#reder-key-cancel-foot').addEventListener('click', closeKeyModal);
  $('#reder-key-modal').addEventListener('keydown', e => {
    if (e.key === 'Escape') closeKeyModal();
  });

  // Provider / model
  $('#reder-provider-sel').addEventListener('change', onProviderChange);

  // File attach
  $('#reder-attach').addEventListener('click', () => $('#reder-file-input').click());
  $('#reder-file-input').addEventListener('change', async e => {
    for (const f of e.target.files) await queueFile(f);
    e.target.value = '';
  });

  // Paste
  document.addEventListener('paste', async e => {
    if (!document.querySelector('#tool-reder.active')) return;
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image')) {
        await queueFile(item.getAsFile());
      }
    }
  });

  // Send
  $('#reder-send').addEventListener('click', sendMessage);
  $('#reder-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
  });

  // Clear
  $('#reder-clear').addEventListener('click', () => {
    conversation.length = 0;
    mediaQueue = [];
    $('#reder-chat-list').innerHTML = '';
    updateMediaPreview();
  });
}
