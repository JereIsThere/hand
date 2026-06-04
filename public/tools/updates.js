// updates.js — Windows-style Update-Notification für Die Hand.
// Electron (gepackt): window.electronAPI IPC-Events.
// Dev (npm start):    GET /api/updates/check → GitHub-Releases.

const isElectron = !!window.electronAPI;

// ── Mini-Styles ───────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  #upd-badge{display:none;align-items:center;gap:5px;margin-left:6px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;cursor:pointer;border:none;vertical-align:middle;}
  #upd-badge.checking{background:#1d1330;color:#6f6488;}
  #upd-badge.available{background:#2a1d00;color:#d4a200;border:1px solid #3a2d00;}
  #upd-badge.downloading{background:#0a1830;color:#00d4c8;border:1px solid #0a2840;}
  #upd-badge.ready{background:#0a2010;color:#00d480;border:1px solid #0a3018;animation:updPulse 2s infinite;}
  #upd-badge.error{background:#2a0a0a;color:#ff8080;border:1px solid #4a0000;}
  @keyframes updPulse{0%,100%{opacity:1}50%{opacity:.6}}

  #upd-modal{display:none;position:fixed;inset:0;z-index:9000;align-items:flex-end;justify-content:flex-start;padding:16px 0 16px 8px;pointer-events:none;}
  #upd-modal.open{display:flex;}
  #upd-card{pointer-events:all;background:#0e0820;border:1px solid #2a1d44;border-radius:14px;padding:18px 20px;min-width:280px;max-width:340px;box-shadow:0 16px 48px rgba(0,0,0,.7);display:flex;flex-direction:column;gap:12px;}
  #upd-card h3{margin:0;font-size:14px;color:#e8e0f0;font-family:Georgia,serif;}
  #upd-card p{margin:0;font-size:12px;color:#9a8fb5;line-height:1.5;}
  #upd-card .upd-row{display:flex;gap:8px;align-items:center;}
  .upd-btn-primary{flex:1;background:linear-gradient(90deg,#00d4c8,#d4a200);border:none;color:#06000e;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;}
  .upd-btn-secondary{background:none;border:1px solid #2a1d44;color:#9a8fb5;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:12px;}
  .upd-btn-secondary:hover{border-color:#00d4c8;color:#e8e0f0;}
  .upd-progress{height:4px;background:#1d1330;border-radius:2px;overflow:hidden;}
  .upd-progress-bar{height:100%;background:linear-gradient(90deg,#00d4c8,#d4a200);transition:width .3s;}
  .upd-ver{font-family:monospace;color:#00d4c8;}
  #upd-channel-sel{background:#0a0118;border:1px solid #2a1d44;color:#9a8fb5;padding:3px 6px;border-radius:6px;font-size:11px;cursor:pointer;}
`;
document.head.append(style);

// ── Modal-DOM ─────────────────────────────────────────────────────────
const overlay = document.createElement('div');
overlay.id = 'upd-modal';
overlay.innerHTML = `<div id="upd-card"><h3 id="upd-title">Updates</h3><p id="upd-body"></p><div id="upd-progress-wrap" style="display:none;" class="upd-progress"><div class="upd-progress-bar" id="upd-bar" style="width:0%"></div></div><div class="upd-row" id="upd-actions"></div></div>`;
document.body.append(overlay);

overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function closeModal() { overlay.classList.remove('open'); }

function showModal({ title, body, progress = null, actions = [] }) {
  overlay.querySelector('#upd-title').textContent = title;
  overlay.querySelector('#upd-body').innerHTML = body;
  const pw = overlay.querySelector('#upd-progress-wrap');
  if (progress !== null) {
    pw.style.display = 'block';
    overlay.querySelector('#upd-bar').style.width = progress + '%';
  } else {
    pw.style.display = 'none';
  }
  const row = overlay.querySelector('#upd-actions');
  row.innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = a.primary ? 'upd-btn-primary' : 'upd-btn-secondary';
    btn.textContent = a.label;
    btn.onclick = a.action;
    row.append(btn);
  }
  overlay.classList.add('open');
}

// ── Badge ─────────────────────────────────────────────────────────────
let badge;

function getBadge() {
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'upd-badge';
    badge.onclick = () => overlay.classList.toggle('open');
    // Nach dem Version-Label einhängen
    const foot = document.getElementById('sidebar-foot-label');
    foot?.after(badge);
  }
  return badge;
}

function setBadge(state, text) {
  const b = getBadge();
  b.className = state;
  b.textContent = text;
  b.style.display = state === 'idle' ? 'none' : 'inline-flex';
}

// ── State-Machine ─────────────────────────────────────────────────────
let state = 'idle'; // idle | available | downloading | ready | error

function onAvailable(version, channel) {
  state = 'available';
  setBadge('available', `⬆ ${version}`);
  showModal({
    title: 'Update verfügbar',
    body: `Version <span class="upd-ver">${version}</span> ist bereit zum Herunterladen.${channel && channel !== 'latest' ? ` <small>(${channel})</small>` : ''}`,
    actions: isElectron
      ? [{ label: 'Herunterladen', primary: true, action: closeModal },   // autoDownload=true, läuft im Hintergrund
         { label: 'Später', action: closeModal }]
      : [{ label: 'Release öffnen', primary: true, action: () => { window.open(window._updReleaseUrl, '_blank'); closeModal(); } },
         { label: 'Schließen', action: closeModal }],
  });
}

function onDownloading(percent) {
  state = 'downloading';
  setBadge('downloading', `⬇ ${percent}%`);
  // Modal nur aktualisieren wenn offen
  if (overlay.classList.contains('open')) {
    overlay.querySelector('#upd-title').textContent = 'Update wird heruntergeladen…';
    overlay.querySelector('#upd-body').textContent = `${percent} % abgeschlossen`;
    const pw = overlay.querySelector('#upd-progress-wrap');
    pw.style.display = 'block';
    overlay.querySelector('#upd-bar').style.width = percent + '%';
    overlay.querySelector('#upd-actions').innerHTML = '<button class="upd-btn-secondary" onclick="document.getElementById(\'upd-modal\').classList.remove(\'open\')">Im Hintergrund</button>';
  }
}

function onReady(version) {
  state = 'ready';
  setBadge('ready', '✓ Neu starten');
  showModal({
    title: 'Update bereit',
    body: `Version <span class="upd-ver">${version}</span> wurde heruntergeladen und wird beim Neustart installiert.`,
    actions: [
      { label: 'Jetzt neu starten', primary: true, action: () => { closeModal(); window.electronAPI.installNow(); } },
      { label: 'Später (beim Beenden)', action: closeModal },
    ],
  });
}

function onError(message) {
  setBadge('error', '⚠ Update-Fehler');
  if (overlay.classList.contains('open')) {
    showModal({
      title: 'Update fehlgeschlagen',
      body: `<small style="color:#ff8080">${message}</small>`,
      actions: [{ label: 'Schließen', action: closeModal }],
    });
  }
}

// ── Electron IPC ──────────────────────────────────────────────────────
function initElectron() {
  window.electronAPI.onUpdateStatus((_e, data) => {
    if (data.status === 'available')       onAvailable(data.version, data.channel);
    else if (data.status === 'downloading') onDownloading(data.percent ?? 0);
    else if (data.status === 'ready')       onReady(data.version);
    else if (data.status === 'error')       onError(data.message);
    else if (data.status === 'channel-changed') {
      setBadge('checking', '⟳ prüfe…');
    }
  });

  // Channel-Selector im Modal (Zahnrad im Badge öffnet extended view)
  badge = getBadge();
  badge.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const ch = await window.electronAPI.getChannel();
    showModal({
      title: 'Update-Kanal',
      body: `Aktueller Kanal: <span class="upd-ver">${ch}</span><br><br>
             <label style="font-size:12px;color:#9a8fb5;">Kanal wechseln: <select id="upd-channel-sel" class="upd-channel-sel">
               <option value="latest" ${ch === 'latest' ? 'selected' : ''}>latest (stabil)</option>
               <option value="beta"   ${ch === 'beta'   ? 'selected' : ''}>beta</option>
             </select></label>`,
      actions: [
        { label: 'Übernehmen', primary: true, action: () => {
            const sel = document.getElementById('upd-channel-sel');
            if (sel) window.electronAPI.setChannel(sel.value);
            closeModal();
        }},
        { label: 'Abbrechen', action: closeModal },
      ],
    });
  });
}

// ── Dev-Mode (npm start) ──────────────────────────────────────────────
async function initDev() {
  try {
    const r = await fetch('/api/updates/check');
    if (!r.ok) return;
    const data = await r.json();
    if (data.hasUpdate) {
      window._updReleaseUrl = data.releaseUrl;
      onAvailable(data.latest, 'dev');
    }
  } catch { /* kein Internet oder Rate-Limit — stillschweigend */ }
}

// ── Bootstrap ─────────────────────────────────────────────────────────
export function initUpdates() {
  if (isElectron) {
    initElectron();
  } else {
    // Dev: einmal beim Start prüfen
    initDev();
  }
}
