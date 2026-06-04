// updates.js — Windows-style Update-Notification für Die Hand.
// Electron (gepackt): window.electronAPI IPC-Events.
// Dev (npm start):    GET /api/updates/check → GitHub-Releases-API.

const isElectron = !!window.electronAPI;

// ── Styles ────────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  #upd-badge {
    display: none; align-items: center; gap: 5px;
    margin-top: 4px; padding: 2px 8px; border-radius: 10px;
    font-size: 10px; font-weight: 700; cursor: pointer; border: none;
    width: fit-content;
  }
  #upd-badge.available  { background: #2a1d00; color: #d4a200; border: 1px solid #3a2d00; }
  #upd-badge.downloading{ background: #0a1830; color: #00d4c8; border: 1px solid #0a2840; }
  #upd-badge.ready      { background: #0a2010; color: #00d480; border: 1px solid #0a3018; animation: updPulse 2s infinite; }
  #upd-badge.error      { background: #2a0a0a; color: #ff8080; border: 1px solid #4a0000; }
  @keyframes updPulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }

  #upd-toast {
    position: fixed; bottom: 20px; right: 20px; z-index: 9100;
    width: 320px; background: #0e0820; border: 1px solid #2a1d44;
    border-radius: 14px; padding: 16px 18px; box-shadow: 0 16px 48px rgba(0,0,0,.75);
    display: flex; flex-direction: column; gap: 10px;
    transform: translateY(120%); opacity: 0;
    transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .25s;
    pointer-events: none;
  }
  #upd-toast.visible { transform: translateY(0); opacity: 1; pointer-events: all; }
  #upd-toast h3 { margin: 0; font-size: 13px; font-weight: 700; color: #e8e0f0; font-family: Georgia, serif; display: flex; align-items: center; gap: 8px; }
  #upd-toast p  { margin: 0; font-size: 12px; color: #9a8fb5; line-height: 1.55; }
  #upd-toast .upd-actions { display: flex; gap: 8px; }
  .upd-btn-primary {
    flex: 1; background: linear-gradient(90deg, #00d4c8, #d4a200);
    border: none; color: #06000e; font-weight: 700;
    padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
  }
  .upd-btn-secondary {
    background: none; border: 1px solid #2a1d44; color: #9a8fb5;
    padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 12px;
  }
  .upd-btn-secondary:hover { border-color: #00d4c8; color: #e8e0f0; }
  .upd-progress { height: 3px; background: #1d1330; border-radius: 2px; overflow: hidden; }
  .upd-progress-bar { height: 100%; background: linear-gradient(90deg, #00d4c8, #d4a200); transition: width .3s; }
  .upd-ver { font-family: monospace; color: #00d4c8; }
  #upd-channel-sel {
    background: #0a0118; border: 1px solid #2a1d44; color: #9a8fb5;
    padding: 3px 6px; border-radius: 6px; font-size: 11px; cursor: pointer;
  }
`;
document.head.append(style);

// ── Toast-DOM ─────────────────────────────────────────────────────────
const toast = document.createElement('div');
toast.id = 'upd-toast';
toast.innerHTML = `
  <h3 id="upd-t-title"></h3>
  <p id="upd-t-body"></p>
  <div class="upd-progress" id="upd-progress" style="display:none">
    <div class="upd-progress-bar" id="upd-bar" style="width:0%"></div>
  </div>
  <div class="upd-actions" id="upd-t-actions"></div>
`;
document.body.append(toast);

let toastTimer = null;

function showToast({ title, icon = '', body, progress = null, actions = [], autohide = 0 }) {
  toast.querySelector('#upd-t-title').innerHTML = (icon ? icon + ' ' : '') + title;
  toast.querySelector('#upd-t-body').innerHTML = body;

  const prog = toast.querySelector('#upd-progress');
  if (progress !== null) {
    prog.style.display = 'block';
    toast.querySelector('#upd-bar').style.width = progress + '%';
  } else {
    prog.style.display = 'none';
  }

  const actEl = toast.querySelector('#upd-t-actions');
  actEl.innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = a.primary ? 'upd-btn-primary' : 'upd-btn-secondary';
    btn.textContent = a.label;
    btn.onclick = a.action;
    actEl.append(btn);
  }

  clearTimeout(toastTimer);
  toast.classList.add('visible');
  if (autohide > 0) toastTimer = setTimeout(hideToast, autohide);
}

function hideToast() { toast.classList.remove('visible'); }

// ── Badge (Sidebar-Footer) ────────────────────────────────────────────
let badge = null;

function getBadge() {
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'upd-badge';
    badge.onclick = () => toast.classList.toggle('visible');
    document.getElementById('sidebar-foot-label')?.after(badge);
  }
  return badge;
}

function setBadge(state, text) {
  const b = getBadge();
  b.className = state;
  b.textContent = text;
  b.style.display = ['available', 'downloading', 'ready', 'error'].includes(state)
    ? 'inline-flex' : 'none';
}

// ── State-Übergänge ───────────────────────────────────────────────────
function onAvailable(version, releaseUrl) {
  setBadge('available', `⬆ ${version}`);
  showToast({
    title: 'Update verfügbar',
    icon: '🔄',
    body: `Version <span class="upd-ver">${version}</span> ist verfügbar.`,
    actions: isElectron
      ? [{ label: 'Im Hintergrund laden', primary: true, action: hideToast },
         { label: 'Später', action: hideToast }]
      : [{ label: 'Release öffnen', primary: true,
           action: () => { window.open(releaseUrl, '_blank'); hideToast(); } },
         { label: 'Schließen', action: hideToast }],
  });
}

function onDownloading(percent) {
  setBadge('downloading', `⬇ ${percent}%`);
  toast.querySelector('#upd-t-title').innerHTML = '⬇ Herunterladen…';
  toast.querySelector('#upd-t-body').textContent = `${percent} % abgeschlossen`;
  const prog = toast.querySelector('#upd-progress');
  prog.style.display = 'block';
  toast.querySelector('#upd-bar').style.width = percent + '%';
  const actEl = toast.querySelector('#upd-t-actions');
  if (!actEl.querySelector('[data-bg]')) {
    actEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'upd-btn-secondary';
    btn.dataset.bg = '1';
    btn.textContent = 'Im Hintergrund';
    btn.onclick = hideToast;
    actEl.append(btn);
  }
}

function onReady(version) {
  setBadge('ready', '✓ Neu starten');
  showToast({
    title: 'Bereit zur Installation',
    icon: '✅',
    body: `Version <span class="upd-ver">${version}</span> heruntergeladen — wird beim Beenden installiert.`,
    actions: [
      { label: 'Jetzt neu starten', primary: true,
        action: () => { hideToast(); window.electronAPI.installNow(); } },
      { label: 'Beim Beenden', action: hideToast },
    ],
  });
}

function onError(msg) {
  setBadge('error', '⚠ Fehler');
  showToast({
    title: 'Update fehlgeschlagen',
    icon: '⚠',
    body: `<small style="color:#ff8080">${msg}</small>`,
    actions: [{ label: 'Schließen', action: hideToast }],
    autohide: 8000,
  });
}

function onUpToDate(version) {
  // kein Badge — kurze Toast-Bestätigung, verschwindet von selbst
  showToast({
    title: 'Alles aktuell',
    icon: '✓',
    body: `Version <span class="upd-ver">${version}</span> ist die aktuelle Version.`,
    actions: [{ label: 'OK', action: hideToast }],
    autohide: 4000,
  });
}

// ── Electron ──────────────────────────────────────────────────────────
function initElectron() {
  window.electronAPI.onUpdateStatus((_e, data) => {
    if      (data.status === 'available')    onAvailable(data.version, null);
    else if (data.status === 'downloading')  onDownloading(data.percent ?? 0);
    else if (data.status === 'ready')        onReady(data.version);
    else if (data.status === 'error')        onError(data.message);
  });

  // Rechtsklick auf Badge: Channel-Wechsel
  getBadge().addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const ch = await window.electronAPI.getChannel();
    showToast({
      title: 'Update-Kanal',
      icon: '📡',
      body: `Aktuell: <span class="upd-ver">${ch}</span><br><br>
             <label style="font-size:11px;color:#9a8fb5;">Kanal:
               <select id="upd-channel-sel">
                 <option value="latest" ${ch === 'latest' ? 'selected' : ''}>latest (stabil)</option>
                 <option value="beta"   ${ch === 'beta'   ? 'selected' : ''}>beta</option>
               </select>
             </label>`,
      actions: [
        { label: 'Übernehmen', primary: true, action: () => {
            const sel = document.getElementById('upd-channel-sel');
            if (sel) window.electronAPI.setChannel(sel.value);
            hideToast();
          }},
        { label: 'Abbrechen', action: hideToast },
      ],
    });
  });
}

// ── Dev (npm start) ───────────────────────────────────────────────────
let lastDevCheck = { latest: null, releaseUrl: null };

async function checkDev(manual = false) {
  try {
    const r = await fetch('/api/updates/check');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    lastDevCheck = data;
    if (data.hasUpdate) {
      onAvailable(data.latest, data.releaseUrl);
    } else if (manual) {
      onUpToDate(data.current);
    }
  } catch (e) {
    if (manual) onError(e.message);
  }
}

function initDev() {
  // Einmal beim Start prüfen
  checkDev(false);

  // Rechtsklick auf Badge oder Version-Label: manuell prüfen
  const foot = document.getElementById('sidebar-foot-label');
  const triggerManual = (e) => { e.preventDefault(); checkDev(true); };
  getBadge().addEventListener('contextmenu', triggerManual);
  foot?.addEventListener('contextmenu', triggerManual);
}

// ── Export ────────────────────────────────────────────────────────────
export function initUpdates() {
  if (isElectron) initElectron();
  else            initDev();
}
