// sprecher — Chat-Tool in Die Hand (Codex-Stil).
// Direkte Anthropic + Grok APIs (kein n8n für Text), Sessions in OrientDB.

import { $, el, toast } from '../shared/ui.js';

// ── Helpers ───────────────────────────────────────────────────────────
const uid = () => 's_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const now = () => new Date().toISOString();

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Minimaler Markdown→HTML: code, bold, italic, links
function md(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        const pre = `<pre class="sp-code"><code class="sp-code-lang-${escHtml(codeLang)}">${escHtml(codeLines.join('\n'))}</code><button class="sp-code-copy" title="kopieren">⧉</button></pre>`;
        out.push(pre);
        inCode = false; codeLines = []; codeLang = '';
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    let l = escHtml(line);
    // inline code
    l = l.replace(/`([^`]+)`/g, '<code class="sp-ic">$1</code>');
    // bold
    l = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // italic
    l = l.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // links
    l = l.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // headings
    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^(#+)/)[1].length;
      l = `<h${level} class="sp-h">${l.replace(/^#+\s/, '')}</h${level}>`;
    } else if (l.trim()) {
      l = `<span>${l}</span>`;
    }
    out.push(l);
  }
  if (inCode && codeLines.length) out.push(`<pre class="sp-code"><code>${escHtml(codeLines.join('\n'))}</code></pre>`);
  return out.join('\n');
}

// ── State ─────────────────────────────────────────────────────────────
let sessions = [];
let currentSid = null;
let currentMessages = [];
let currentModel = 'claude-sonnet-4-6';
let availableModels = [];
let pendingAttachments = [];
let streaming = false;
let root = null;

// ── API ───────────────────────────────────────────────────────────────
async function j(res) {
  const t = await res.text();
  let d; try { d = t ? JSON.parse(t) : {}; } catch { d = { error: t }; }
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

const api = {
  listSessions:   ()        => fetch('/api/sessions').then(j),
  getSession:     (sid)     => fetch(`/api/sessions/${sid}`).then(j),
  saveSession:    (sid, b)  => fetch(`/api/sessions/${sid}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) }).then(j),
  deleteSession:  (sid)     => fetch(`/api/sessions/${sid}`, { method:'DELETE' }).then(j),
  getModels:      ()        => fetch('/api/models').then(j),
};

// ── Render-Grundgerüst ────────────────────────────────────────────────
function renderShell() {
  root = document.getElementById('sprecher-root');
  root.innerHTML = '';
  root.style.cssText = 'display:flex;height:100%;font-family:-apple-system,system-ui,sans-serif;color:#e8e0f0;background:#06000e;';

  root.innerHTML = `
<style>
  .sp-sidebar{width:220px;min-width:160px;background:#0a0118;border-right:1px solid #1d1330;display:flex;flex-direction:column;overflow:hidden;}
  .sp-sidebar-head{padding:12px 12px 8px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #1d1330;}
  .sp-brand{font-size:15px;font-weight:700;font-family:Georgia,serif;color:#e8e0f0;flex:1;}
  .sp-new-btn{background:linear-gradient(90deg,#00d4c8,#d4a200);border:none;color:#06000e;font-weight:700;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;}
  .sp-session-list{flex:1;overflow-y:auto;padding:8px 6px;}
  .sp-sess{padding:8px 8px;border-radius:8px;cursor:pointer;font-size:13px;color:#9a8fb5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;margin-bottom:2px;}
  .sp-sess:hover{background:#140830;color:#e8e0f0;}
  .sp-sess.active{background:#1d1330;color:#e8e0f0;}
  .sp-sess-del{margin-left:auto;opacity:0;background:none;border:none;color:#6f6488;cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0;}
  .sp-sess:hover .sp-sess-del{opacity:1;}
  .sp-main{flex:1;display:flex;flex-direction:column;overflow:hidden;}
  .sp-topbar{padding:10px 16px;border-bottom:1px solid #1d1330;display:flex;align-items:center;gap:10px;}
  .sp-title{font-family:Georgia,serif;font-size:15px;font-weight:600;flex:1;cursor:pointer;color:#e8e0f0;}
  .sp-title:hover{color:#00d4c8;}
  .sp-model-sel{background:#0e0820;border:1px solid #2a1d44;color:#9a8fb5;padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer;}
  .sp-model-sel:focus{outline:none;border-color:#00d4c8;}
  .sp-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}
  .sp-msg{display:flex;gap:10px;max-width:100%;}
  .sp-msg.user{flex-direction:row-reverse;}
  .sp-avatar{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-top:2px;}
  .sp-avatar.assistant{background:linear-gradient(135deg,#00d4c8,#d4a200);color:#06000e;}
  .sp-avatar.user{background:#1d1330;color:#9a8fb5;}
  .sp-avatar.grok{background:linear-gradient(135deg,#6b00cc,#ff5c28);color:#fff;}
  .sp-bubble{max-width:80%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.65;}
  .sp-msg.assistant .sp-bubble{background:#0e0820;border:1px solid #1d1330;color:#e8e0f0;}
  .sp-msg.user .sp-bubble{background:#1d1330;color:#e8e0f0;}
  .sp-msg.error .sp-bubble{background:#2a0a0a;border:1px solid #4a0000;color:#ff8080;}
  .sp-meta{font-size:11px;color:#6f6488;margin-bottom:4px;}
  .sp-code{background:#0a0118;border:1px solid #1d1330;border-radius:8px;padding:12px;overflow-x:auto;position:relative;margin:6px 0;}
  .sp-code code{font-family:Cascadia Code,Consolas,monospace;font-size:12px;color:#c8e0d0;}
  .sp-code-copy{position:absolute;top:6px;right:6px;background:#1d1330;border:none;color:#9a8fb5;cursor:pointer;border-radius:4px;padding:2px 6px;font-size:11px;}
  .sp-code-copy:hover{color:#00d4c8;}
  .sp-ic{background:#0a0118;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:13px;}
  .sp-h{color:#00d4c8;font-family:Georgia,serif;margin:8px 0 4px;}
  .sp-img-resp{max-width:100%;border-radius:10px;margin-top:6px;cursor:pointer;}
  .sp-msg-tools{display:flex;gap:6px;margin-top:4px;opacity:0;transition:opacity .15s;}
  .sp-msg:hover .sp-msg-tools{opacity:1;}
  .sp-tool-btn{background:none;border:none;color:#6f6488;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px;}
  .sp-tool-btn:hover{color:#00d4c8;background:#0e0820;}
  .sp-typing{display:flex;gap:4px;padding:4px 0;}
  .sp-typing span{width:6px;height:6px;border-radius:50%;background:#00d4c8;animation:spBlink 1s infinite;}
  .sp-typing span:nth-child(2){animation-delay:.2s;}
  .sp-typing span:nth-child(3){animation-delay:.4s;}
  @keyframes spBlink{0%,80%,100%{opacity:.2}40%{opacity:1}}
  .sp-input-area{padding:12px 16px;border-top:1px solid #1d1330;display:flex;flex-direction:column;gap:8px;}
  .sp-attach-prev{display:flex;gap:6px;flex-wrap:wrap;}
  .sp-attach-chip{background:#1d1330;border-radius:6px;padding:3px 8px;font-size:12px;color:#9a8fb5;display:flex;align-items:center;gap:4px;}
  .sp-attach-chip button{background:none;border:none;color:#6f6488;cursor:pointer;padding:0;font-size:14px;}
  .sp-input-row{display:flex;gap:8px;align-items:flex-end;}
  .sp-attach-btn{background:none;border:1px solid #2a1d44;color:#6f6488;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:14px;flex-shrink:0;}
  .sp-attach-btn:hover{border-color:#00d4c8;color:#00d4c8;}
  .sp-input{flex:1;background:#0e0820;border:1px solid #2a1d44;border-radius:8px;color:#e8e0f0;padding:8px 12px;font-size:14px;resize:none;min-height:40px;max-height:200px;overflow-y:auto;font-family:inherit;line-height:1.5;}
  .sp-input:focus{outline:none;border-color:#00d4c8;}
  .sp-send{background:linear-gradient(90deg,#00d4c8,#d4a200);border:none;color:#06000e;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px;flex-shrink:0;}
  .sp-send:disabled{opacity:.4;cursor:not-allowed;}
  .sp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#6f6488;text-align:center;gap:12px;}
  .sp-empty .icon{font-size:48px;}
  .sp-empty h2{font-family:Georgia,serif;font-size:20px;color:#9a8fb5;}
</style>

<div class="sp-sidebar">
  <div class="sp-sidebar-head">
    <span class="sp-brand">👄 sprecher</span>
    <button class="sp-new-btn" id="sp-new">+ neu</button>
  </div>
  <div class="sp-session-list" id="sp-session-list"></div>
</div>

<div class="sp-main">
  <div class="sp-topbar">
    <div class="sp-title" id="sp-title" title="Umbenennen">Neues Gespräch</div>
    <select class="sp-model-sel" id="sp-model-sel"></select>
  </div>
  <div class="sp-messages" id="sp-messages">
    <div class="sp-empty">
      <div class="icon">👄</div>
      <h2>sprecher</h2>
      <p>Claude · Grok · Bilder — wähle ein Modell und fang an.</p>
    </div>
  </div>
  <div class="sp-input-area">
    <div class="sp-attach-prev" id="sp-attach-prev" style="display:none;"></div>
    <div class="sp-input-row">
      <button class="sp-attach-btn" id="sp-attach-btn" title="Bild anhängen (oder einfach einfügen)">📎</button>
      <textarea class="sp-input" id="sp-input" rows="1" placeholder="Nachricht … /image [prompt] für Bildgenerierung"></textarea>
      <button class="sp-send" id="sp-send">Senden</button>
    </div>
  </div>
</div>
<input type="file" id="sp-file-input" accept="image/*" style="display:none;" multiple>
`;
}

// ── Sessions-Sidebar ──────────────────────────────────────────────────
function renderSessionList() {
  const list = root.querySelector('#sp-session-list');
  list.innerHTML = '';
  if (!sessions.length) {
    list.append(el('div', { style: 'padding:12px 8px;color:#6f6488;font-size:12px;' }, 'noch keine Gespräche'));
    return;
  }
  for (const s of sessions) {
    const item = el('div', {
      class: 'sp-sess' + (s.sid === currentSid ? ' active' : ''),
      onclick: () => loadSession(s.sid),
    },
      el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;' }, s.title || 'Neues Gespräch'),
      el('button', {
        class: 'sp-sess-del', title: 'löschen',
        onclick: async (e) => {
          e.stopPropagation();
          if (!confirm(`Gespräch löschen?`)) return;
          await api.deleteSession(s.sid);
          sessions = sessions.filter(x => x.sid !== s.sid);
          if (currentSid === s.sid) { currentSid = null; currentMessages = []; renderMessages(); }
          renderSessionList();
        },
      }, '×'),
    );
    list.append(item);
  }
}

// ── Modell-Selector ───────────────────────────────────────────────────
function renderModelSelector() {
  const sel = root.querySelector('#sp-model-sel');
  sel.innerHTML = '';
  const groups = { 'Claude': [], 'Grok': [], 'Sonstige': [] };
  for (const m of availableModels) {
    const grp = m.provider === 'anthropic' ? 'Claude' : m.provider === 'xai' ? 'Grok' : 'Sonstige';
    groups[grp].push(m);
  }
  for (const [name, models] of Object.entries(groups)) {
    if (!models.length) continue;
    const og = el('optgroup', { label: name });
    for (const m of models) {
      const opt = el('option', {
        value: m.id,
        ...(m.id === currentModel ? { selected: true } : {}),
        ...(!m.available ? { disabled: true } : {}),
      }, m.label + (!m.available ? ' (kein Key)' : ''));
      og.append(opt);
    }
    sel.append(og);
  }
  sel.onchange = () => { currentModel = sel.value; };
}

// ── Messages ──────────────────────────────────────────────────────────
function avatarClass(model) {
  if (!model) return 'assistant';
  if (model.startsWith('grok')) return 'grok';
  return 'assistant';
}

function avatarIcon(model) {
  if (!model) return '🤖';
  if (model.startsWith('grok')) return 'G';
  if (model.startsWith('claude')) return 'C';
  return '🤖';
}

function renderMessages() {
  const box = root.querySelector('#sp-messages');
  box.innerHTML = '';
  if (!currentMessages.length) {
    box.innerHTML = `<div class="sp-empty"><div class="icon">👄</div><h2>sprecher</h2><p>Claude · Grok · Bilder</p></div>`;
    return;
  }
  for (const m of currentMessages) appendMsgEl(m);
  box.scrollTop = box.scrollHeight;
}

function appendMsgEl(m, streaming = false) {
  const box = root.querySelector('#sp-messages');
  const isUser = m.role === 'user';
  const isError = m.role === 'error';

  const bubble = el('div', { class: 'sp-bubble' });

  if (m.type === 'image' && m.imageUrl) {
    const img = el('img', { src: m.imageUrl, class: 'sp-img-resp', alt: 'generiertes Bild', onclick: () => window.open(m.imageUrl, '_blank') });
    bubble.append(img);
    if (m.content) bubble.prepend(el('div', { class: 'sp-meta', style: 'margin-bottom:4px;' }, '/image ' + m.content));
  } else if (streaming) {
    bubble.innerHTML = '<div class="sp-typing"><span></span><span></span><span></span></div>';
    bubble.dataset.streaming = '1';
  } else {
    bubble.innerHTML = isUser ? escHtml(m.content || '') : md(m.content || '');
  }

  // Anhänge (User-Bilder)
  if (isUser && m.attachments?.length) {
    for (const a of m.attachments) {
      if (a.dataUrl?.startsWith('data:image')) {
        const img = el('img', { src: a.dataUrl, style: 'max-width:200px;border-radius:8px;margin-top:6px;display:block;' });
        bubble.append(img);
      }
    }
  }

  const tools = el('div', { class: 'sp-msg-tools' });
  const copyBtn = el('button', { class: 'sp-tool-btn', onclick: () => {
    navigator.clipboard.writeText(m.content || '').then(() => { copyBtn.textContent = '✓ kopiert'; setTimeout(() => copyBtn.textContent = '⧉ kopieren', 1200); });
  } }, '⧉ kopieren');
  tools.append(copyBtn);

  const div = el('div', { class: `sp-msg ${isUser ? 'user' : isError ? 'error' : 'assistant'}`, 'data-msgid': m.id || '' },
    el('div', { class: `sp-avatar ${isUser ? 'user' : avatarClass(m.model)}` }, isUser ? '👤' : avatarIcon(m.model)),
    el('div', { style: 'flex:1;min-width:0;' },
      el('div', { class: 'sp-meta' }, isUser ? 'du' : (m.model || 'AI')),
      bubble,
      tools,
    ),
  );

  box.append(div);

  // Code-Copy-Buttons aktivieren
  div.querySelectorAll('.sp-code-copy').forEach(btn => {
    btn.onclick = () => {
      const code = btn.parentElement?.querySelector('code')?.textContent || '';
      navigator.clipboard.writeText(code).then(() => { btn.textContent = '✓'; setTimeout(() => btn.textContent = '⧉', 1200); });
    };
  });

  box.scrollTop = box.scrollHeight;
  return div;
}

function updateStreamingBubble(div, delta) {
  const bubble = div?.querySelector('.sp-bubble');
  if (!bubble) return;
  if (bubble.dataset.streaming) {
    bubble.dataset.fullText = '';
    bubble.dataset.streaming = '';
  }
  bubble.dataset.fullText = (bubble.dataset.fullText || '') + delta;
  bubble.innerHTML = md(bubble.dataset.fullText);
  // Code-Copy-Buttons re-aktivieren
  div.querySelectorAll('.sp-code-copy').forEach(btn => {
    btn.onclick = () => {
      const code = btn.parentElement?.querySelector('code')?.textContent || '';
      navigator.clipboard.writeText(code).then(() => { btn.textContent = '✓'; setTimeout(() => btn.textContent = '⧉', 1200); });
    };
  });
  const box = root.querySelector('#sp-messages');
  box.scrollTop = box.scrollHeight;
}

// ── Session laden ─────────────────────────────────────────────────────
async function loadSession(sid) {
  try {
    const { session, messages } = await api.getSession(sid);
    currentSid = sid;
    currentMessages = messages || [];
    currentModel = session.model || currentModel;
    root.querySelector('#sp-title').textContent = session.title || 'Neues Gespräch';
    root.querySelector('#sp-model-sel').value = currentModel;
    renderSessionList();
    renderMessages();
  } catch (e) { toast('Session laden: ' + e.message, 'fail'); }
}

// ── Senden ────────────────────────────────────────────────────────────
async function sendMessage() {
  if (streaming) return;
  const input = root.querySelector('#sp-input');
  const text = input.value.trim();
  if (!text && !pendingAttachments.length) return;

  // Neue Session anlegen wenn nötig
  if (!currentSid) {
    currentSid = uid();
    await api.saveSession(currentSid, {
      title: text.slice(0, 60) || 'Neues Gespräch',
      model: currentModel,
    });
    sessions.unshift({ sid: currentSid, title: text.slice(0, 60), model: currentModel, updatedAt: now() });
    renderSessionList();
  }

  // /image-Kommando
  const imageMatch = text.match(/^\/image\s+(.+)/i);
  if (imageMatch) {
    input.value = '';
    const prompt = imageMatch[1];
    const userMsg = { role: 'user', content: '/image ' + prompt, type: 'text', model: '' };
    currentMessages.push(userMsg);
    appendMsgEl(userMsg);
    const streamDiv = appendMsgEl({ role: 'assistant', content: '', type: 'text', model: currentModel }, true);
    streaming = true;
    root.querySelector('#sp-send').disabled = true;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: currentSid, model: currentModel, imagePrompt: prompt }),
      });
      const data = await r.json();
      const imgUrl = data.imageUrl || '';
      const bubble = streamDiv.querySelector('.sp-bubble');
      if (bubble) bubble.innerHTML = imgUrl
        ? `<div class="sp-meta" style="margin-bottom:4px;">/image ${escHtml(prompt)}</div><img src="${escHtml(imgUrl)}" class="sp-img-resp" onclick="window.open('${escHtml(imgUrl)}','_blank')">`
        : `<span style="color:#ff8080">Kein Bild erhalten.</span>`;
      currentMessages.push({ role: 'assistant', content: prompt, type: 'image', model: currentModel, imageUrl: imgUrl });
    } catch (e) {
      const bubble = streamDiv.querySelector('.sp-bubble');
      if (bubble) bubble.innerHTML = `<span style="color:#ff8080">${escHtml(e.message)}</span>`;
    } finally {
      streaming = false;
      root.querySelector('#sp-send').disabled = false;
    }
    return;
  }

  // Text-Nachricht
  const attachments = [...pendingAttachments];
  pendingAttachments = [];
  root.querySelector('#sp-attach-prev').style.display = 'none';
  root.querySelector('#sp-attach-prev').innerHTML = '';

  const userMsg = { role: 'user', content: text, type: 'text', attachments };
  currentMessages.push(userMsg);
  appendMsgEl(userMsg);
  input.value = '';
  input.style.height = '';

  // Session-Titel setzen (erste Nachricht)
  if (currentMessages.length === 1) {
    const title = text.slice(0, 60);
    root.querySelector('#sp-title').textContent = title;
    api.saveSession(currentSid, { title, model: currentModel });
    const s = sessions.find(x => x.sid === currentSid);
    if (s) s.title = title;
    renderSessionList();
  }

  // API-Messages zusammenbauen (inkl. Bild-Attachments für Vision-Modelle)
  const apiMessages = currentMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      if (m.role === 'user' && m.attachments?.length) {
        const parts = [{ type: 'text', text: m.content || '' }];
        for (const a of m.attachments) {
          if (a.dataUrl?.startsWith('data:image')) {
            const [meta, b64] = a.dataUrl.split(',');
            const mtype = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
            parts.push({ type: 'image', source: { type: 'base64', media_type: mtype, data: b64 } });
          }
        }
        return { role: 'user', content: parts };
      }
      return { role: m.role, content: m.content || '' };
    });

  const streamDiv = appendMsgEl({ role: 'assistant', content: '', type: 'text', model: currentModel }, true);
  streaming = true;
  root.querySelector('#sp-send').disabled = true;

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: currentSid, model: currentModel, messages: apiMessages }),
    });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        try {
          const ev = JSON.parse(raw);
          if (ev.delta) { fullResponse += ev.delta; updateStreamingBubble(streamDiv, ev.delta); }
          if (ev.error) throw new Error(ev.error);
          if (ev.done) break;
        } catch {}
      }
    }
    currentMessages.push({ role: 'assistant', content: fullResponse, type: 'text', model: currentModel });
  } catch (e) {
    const bubble = streamDiv?.querySelector('.sp-bubble');
    if (bubble) bubble.innerHTML = `<span style="color:#ff8080">${escHtml(e.message)}</span>`;
    toast(e.message, 'fail');
  } finally {
    streaming = false;
    root.querySelector('#sp-send').disabled = false;
    root.querySelector('#sp-input').focus();
  }
}

// ── Attachments ───────────────────────────────────────────────────────
function addAttachment(file) {
  if (!file.type.startsWith('image/')) { toast('Nur Bilder', 'fail'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const a = { name: file.name, type: file.type, dataUrl: e.target.result };
    pendingAttachments.push(a);
    renderAttachPreview();
  };
  reader.readAsDataURL(file);
}

function renderAttachPreview() {
  const prev = root.querySelector('#sp-attach-prev');
  prev.innerHTML = '';
  if (!pendingAttachments.length) { prev.style.display = 'none'; return; }
  prev.style.display = 'flex';
  for (let i = 0; i < pendingAttachments.length; i++) {
    const a = pendingAttachments[i];
    const chip = el('div', { class: 'sp-attach-chip' },
      el('span', {}, a.name),
      el('button', { onclick: () => { pendingAttachments.splice(i, 1); renderAttachPreview(); } }, '×'),
    );
    prev.append(chip);
  }
}

// ── Init ──────────────────────────────────────────────────────────────
let initialized = false;

export function initSprecher() {
  if (initialized) return;
  initialized = true;
  renderShell();
  if (!root) return;

  // Sessions + Modelle laden
  Promise.all([api.listSessions(), api.getModels()]).then(([sessData, modelData]) => {
    sessions = sessData.sessions || [];
    availableModels = modelData.models || [];
    renderSessionList();
    renderModelSelector();
  }).catch(() => {});

  // Events
  root.querySelector('#sp-new').onclick = async () => {
    currentSid = null;
    currentMessages = [];
    root.querySelector('#sp-title').textContent = 'Neues Gespräch';
    renderMessages();
    renderSessionList();
    root.querySelector('#sp-input').focus();
  };

  root.querySelector('#sp-title').onclick = async () => {
    if (!currentSid) return;
    const newTitle = prompt('Titel:', root.querySelector('#sp-title').textContent);
    if (!newTitle?.trim()) return;
    root.querySelector('#sp-title').textContent = newTitle.trim();
    await api.saveSession(currentSid, { title: newTitle.trim(), model: currentModel });
    const s = sessions.find(x => x.sid === currentSid);
    if (s) s.title = newTitle.trim();
    renderSessionList();
  };

  root.querySelector('#sp-send').onclick = sendMessage;

  const inp = root.querySelector('#sp-input');
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    // Auto-resize
    requestAnimationFrame(() => {
      inp.style.height = '';
      inp.style.height = Math.min(inp.scrollHeight, 200) + 'px';
    });
  });

  // Paste-Bilder
  inp.addEventListener('paste', (e) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) { addAttachment(item.getAsFile()); }
    }
  });

  // Drag & Drop
  root.querySelector('#sp-messages').addEventListener('dragover', (e) => e.preventDefault());
  root.querySelector('#sp-messages').addEventListener('drop', (e) => {
    e.preventDefault();
    for (const f of e.dataTransfer.files) addAttachment(f);
  });

  root.querySelector('#sp-attach-btn').onclick = () => root.querySelector('#sp-file-input').click();
  root.querySelector('#sp-file-input').onchange = (e) => { for (const f of e.target.files) addAttachment(f); e.target.value = ''; };
}

export function activateSprecher() {
  if (!root) { renderShell(); initSprecher(); }
  root.querySelector('#sp-input')?.focus();
}

export function deactivateSprecher() {}
