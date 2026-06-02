import { $, el, toast } from '../shared/ui.js';
import { me, isAdmin } from './gate.js';

let _onComplete = null;

async function loadStatus() {
  const r = await fetch('/api/setup-status');
  if (!r.ok) return null;
  return r.json();
}

async function saveToVault(key, value, service) {
  const r = await fetch(`/api/vault/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, service }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `HTTP ${r.status}`);
  }
}

function ensureStyles() {
  if (document.getElementById('settings-modal-styles')) return;
  const style = el('style', { id: 'settings-modal-styles' });
  style.textContent = `
    .settings-overlay {
      position: fixed; inset: 0; z-index: 3000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(6,0,14,.92); padding: 24px;
    }
    .settings-shell {
      width: min(820px, 100%);
      height: 560px;
      background: #0e0820;
      border: 1px solid #1d1330;
      border-radius: 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,.6);
      display: flex;
      overflow: hidden;
      color: #e8e0f0;
      animation: settings-fade-in .2s ease;
    }
    @keyframes settings-fade-in {
      from { opacity: 0; transform: scale(.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .settings-sidebar {
      width: 210px;
      background: #090415;
      border-right: 1px solid #1c1130;
      display: flex;
      flex-direction: column;
      padding: 20px 10px;
      gap: 4px;
      flex-shrink: 0;
    }
    .settings-sidebar-header {
      padding: 0 12px 16px;
      font-family: Georgia, serif;
      font-size: 18px;
      font-weight: 700;
      border-bottom: 1px solid #1c1130;
      margin-bottom: 14px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .settings-tab-btn {
      appearance: none; background: none; border: none;
      width: 100%; text-align: left; cursor: pointer;
      color: #9a8fb5; padding: 10px 12px; border-radius: 8px;
      font-size: 13px; font-weight: 500;
      display: flex; align-items: center; gap: 10px;
      transition: all .15s ease;
      font-family: inherit;
    }
    .settings-tab-btn:hover {
      background: #1c1130; color: #fff;
    }
    .settings-tab-btn.active {
      background: #1e1236; color: #00d4c8;
      box-shadow: inset 3px 0 0 #00d4c8;
    }
    .settings-content-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .settings-pane-header {
      padding: 20px 24px;
      border-bottom: 1px solid #1c1130;
    }
    .settings-pane-title {
      font-family: Georgia, serif;
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .settings-pane-desc {
      font-size: 12px;
      color: #9a8fb5;
    }
    .settings-pane-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }
    .settings-pane-footer {
      padding: 16px 24px;
      border-top: 1px solid #1c1130;
      background: #090415;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      align-items: center;
    }
    .profile-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 24px;
      background: #090415;
      border: 1px solid #1c1130;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .profile-card-avatar {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: linear-gradient(135deg,#00d4c8,#d4a200);
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; margin-bottom: 14px;
      border: 2px solid #1c1130;
      overflow: hidden;
    }
    .profile-card-avatar img {
      width: 100%; height: 100%; object-fit: cover;
    }
    .profile-card-name {
      font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 4px;
    }
    .profile-card-email {
      font-size: 13px; color: #9a8fb5; margin-bottom: 12px;
    }
    .profile-card-role {
      font-size: 11px; padding: 3px 8px; border-radius: 6px;
      background: #1e1236; color: #00d4c8; font-weight: 600;
    }
    .update-channel-card {
      background: #090415;
      border: 1px solid #1c1130;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }

    @media (max-width: 640px) {
      .settings-shell {
        flex-direction: column;
        height: 85vh;
      }
      .settings-sidebar {
        width: 100%;
        flex-direction: row;
        overflow-x: auto;
        border-right: none;
        border-bottom: 1px solid #1c1130;
        padding: 10px;
        height: auto;
      }
      .settings-sidebar-header {
        display: none;
      }
      .settings-tab-btn {
        width: auto;
        white-space: nowrap;
        padding: 8px 12px;
      }
      .settings-tab-btn.active {
        box-shadow: inset 0 -3px 0 #00d4c8;
        background: none;
      }
    }
  `;
  document.head.append(style);
}

function renderGroup(groupName, items, savedValues) {
  const rows = items.map(item => {
    const inputId = `setup-${item.key}`;
    const badge = item.set
      ? el('span', { style: 'color:#2dd66e;font-size:11px;' }, '✓ gesetzt')
      : el('span', { style: 'color:#888;font-size:11px;' }, 'fehlt');

    const input = el('input', {
      id: inputId,
      type: item.secret ? 'password' : 'text',
      placeholder: item.set ? '(bereits gesetzt — leer lassen zum Beibehalten)' : item.placeholder,
      autocomplete: 'off',
      style: 'font-family:monospace; background:#0e0820; border-color:#2a1d44; color:#e8e0f0; width:100%; padding:8px 10px; border-radius:6px;',
      'data-key': item.key,
      'data-service': item.service,
    });

    const revealBtn = item.secret ? el('button', {
      class: 'btn ghost',
      type: 'button',
      style: 'padding:2px 8px;font-size:12px;flex-shrink:0; border-color:#2a1d44; color:#9a8fb5;',
      onclick: () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        revealBtn.textContent = input.type === 'password' ? '👁' : '🙈';
      },
    }, '👁') : null;

    const hint = item.bootstrapHint
      ? el('small', { style: 'color:#ff9500;display:block;margin-top:4px;' },
          '⚠ Bootstrap-Secret — besser in .env statt im Vault (wird vor OrientDB gebraucht).')
      : null;

    const wrap = el('div', { style: 'display:flex;gap:6px;align-items:stretch;width:100%;' }, input);
    if (revealBtn) wrap.append(revealBtn);

    return el('div', { class: 'field', style: 'margin-bottom:14px;' },
      el('label', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-family:monospace;font-size:11px;color:#9a8fb5;' },
        el('span', { style: 'font-weight:600;' }, item.label),
        badge,
      ),
      el('small', { style: 'color:#6f6488;display:block;margin-bottom:6px;font-size:12px;line-height:1.4;' }, item.description),
      wrap,
      ...(hint ? [hint] : []),
    );
  });

  return el('div', { style: 'margin-bottom:24px;' },
    el('div', {
      style: 'font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6f6488;' +
             'margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #1c1130;font-weight:600;',
    }, groupName),
    ...rows,
  );
}

export async function checkAndShowSetupWizard(force = false) {
  // Verhindert das automatische Aufploppen des Setup-Wizards beim ersten Boot
  if (!force) return;
  
  let status;
  try { status = await loadStatus(); } catch { return; }
  if (!status) return;
  showSetupWizard(status, force);
}

export function showSetupWizard(status, force = false) {
  ensureStyles();
  const { items } = status || { items: [] };

  // Profil Pane
  const user = me();
  const avatarContent = user?.picture
    ? el('img', { src: user.picture })
    : el('span', {}, (user?.name || user?.email || '?')[0].toUpperCase());

  const profileCard = el('div', { class: 'profile-card' },
    el('div', { class: 'profile-card-avatar' }, avatarContent),
    el('div', { class: 'profile-card-name' }, user?.name || 'Nutzer'),
    el('div', { class: 'profile-card-email' }, user?.email || ''),
    el('div', { class: 'profile-card-role' }, user?.role === 'admin' ? 'arm · admin' : 'freund')
  );

  const logoutBtn = el('button', {
    class: 'btn danger ghost',
    style: 'width:100%; max-width:200px; margin: 0 auto; display:block; border-color:#2a1d44;',
    onclick: async () => {
      await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
      location.reload();
    }
  }, 'Abmelden');

  const paneProfil = el('div', { style: 'display:block;' },
    profileCard,
    logoutBtn
  );

  // Keys Pane
  const groups = {};
  for (const item of items) {
    (groups[item.group] ||= []).push(item);
  }
  const groupEls = Object.entries(groups).map(([name, grpItems]) =>
    renderGroup(name, grpItems, {})
  );
  const paneKeys = el('div', { style: 'display:none;' },
    el('p', { style: 'font-size:13px; color:#9a8fb5; margin-bottom:20px; line-height:1.5;' },
      'Konfiguriere optionale System-Schlüssel. Eingaben werden verschlüsselt im Vault gespeichert. ' +
      'Leer lassen, um den bereits gespeicherten Wert beizubehalten.'
    ),
    el('div', { id: 'setup-fields' }, ...groupEls)
  );

  // Updates Pane
  const updateInfoEl = el('div', { style: 'margin-top:12px; font-size:13px; color:#6f6488;' }, 'Keine Updates geladen.');

  const checkBtn = el('button', {
    class: 'btn ghost',
    style: 'border-color:#2a1d44; color:#9a8fb5; font-size:12px; padding:6px 12px;',
    onclick: async () => {
      if (window.electronAPI?.getChannel) {
        updateInfoEl.textContent = 'Suche nach Updates...';
        const ch = await window.electronAPI.getChannel();
        window.electronAPI.setChannel(ch);
      }
    }
  }, 'Jetzt suchen');

  const chProdBtn = el('button', {
    class: 'btn ghost',
    style: 'flex:1; border-color:#2a1d44; font-size:12px; padding:8px;',
    onclick: async () => {
      if (window.electronAPI) {
        window.electronAPI.setChannel('latest');
        updateChannelSelector('latest');
      }
    }
  }, '🟢 prod (stabil)');

  const chDevBtn = el('button', {
    class: 'btn ghost',
    style: 'flex:1; border-color:#2a1d44; font-size:12px; padding:8px;',
    onclick: async () => {
      if (window.electronAPI) {
        window.electronAPI.setChannel('beta');
        updateChannelSelector('beta');
      }
    }
  }, '🟡 dev (beta)');

  function updateChannelSelector(channel) {
    const isProd = channel === 'latest';
    chProdBtn.style.background = isProd ? '#0a2a2a' : 'none';
    chProdBtn.style.borderColor = isProd ? '#00d4c8' : '#2a1d44';
    chProdBtn.style.color = isProd ? '#00d4c8' : '#6f6488';
    chDevBtn.style.background = !isProd ? '#2a1a00' : 'none';
    chDevBtn.style.borderColor = !isProd ? '#d4a200' : '#2a1d44';
    chDevBtn.style.color = !isProd ? '#d4a200' : '#6f6488';
  }

  if (window.electronAPI?.getChannel) {
    window.electronAPI.getChannel().then(updateChannelSelector);
  }

  const paneUpdates = el('div', { style: 'display:none;' },
    el('div', { class: 'update-channel-card' },
      el('h4', { style: 'font-size:14px; font-weight:600; margin-bottom:10px; color:#fff;' }, 'Update-Kanal'),
      el('p', { style: 'font-size:12px; color:#9a8fb5; margin-bottom:14px; line-height:1.5;' },
        'Wähle aus, welche Updates du beziehen möchtest. Der dev-Kanal enthält die neuesten Builds, ' +
        'kann aber instabil sein.'
      ),
      el('div', { style: 'display:flex; gap:10px;' }, chProdBtn, chDevBtn)
    ),
    el('div', { class: 'update-channel-card' },
      el('h4', { style: 'font-size:14px; font-weight:600; margin-bottom:10px; color:#fff;' }, 'Update-Status'),
      updateInfoEl,
      el('div', { style: 'margin-top:14px;' }, checkBtn)
    ),
    (() => {
      const list = el('div', { id: 'update-history-list', style: 'display:flex; flex-direction:column; gap:10px;' },
        el('div', { style: 'font-size:12px; color:#6f6488;' }, 'Lade Verlauf…')
      );
      fetch('https://api.github.com/repos/JereIsThere/hand/releases?per_page=20')
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(releases => {
          list.innerHTML = '';
          if (!releases.length) {
            list.appendChild(el('div', { style: 'font-size:12px; color:#6f6488;' }, 'Keine Releases gefunden.'));
            return;
          }
          for (const r of releases) {
            const date = new Date(r.published_at || r.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const isPre = r.prerelease;
            const tagBadge = el('span', {
              style: `font-size:10px; padding:2px 8px; border-radius:10px; font-weight:600; letter-spacing:.5px; ${isPre ? 'background:#3a2860; color:#d4b8ff;' : 'background:#1a3a2e; color:#7de3a8;'}`
            }, isPre ? 'BETA' : 'STABLE');
            const header = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; gap:8px;' },
              el('div', { style: 'display:flex; align-items:center; gap:8px;' },
                el('strong', { style: 'color:#fff; font-size:13px;' }, r.tag_name),
                tagBadge
              ),
              el('span', { style: 'font-size:11px; color:#6f6488;' }, date)
            );
            const body = (r.body || '').trim();
            const notes = body
              ? el('pre', {
                  style: 'margin:6px 0 0; font-family:inherit; font-size:11px; color:#9a8fb5; white-space:pre-wrap; line-height:1.5; max-height:120px; overflow:auto;'
                }, body.length > 600 ? body.slice(0, 600) + '…' : body)
              : null;
            const item = el('div', {
              style: 'border:1px solid #1d1330; border-radius:8px; padding:10px 12px; background:rgba(255,255,255,.02);'
            }, header);
            if (notes) item.appendChild(notes);
            list.appendChild(item);
          }
        })
        .catch(err => {
          list.innerHTML = '';
          list.appendChild(el('div', { style: 'font-size:12px; color:#ff8080;' }, 'Verlauf konnte nicht geladen werden: ' + err.message));
        });
      return el('div', { class: 'update-channel-card' },
        el('h4', { style: 'font-size:14px; font-weight:600; margin-bottom:10px; color:#fff;' }, 'Versions-Verlauf'),
        el('p', { style: 'font-size:12px; color:#9a8fb5; margin-bottom:14px; line-height:1.5;' },
          'Liste aller veröffentlichten Versionen aus GitHub. Stable und Beta gemischt.'
        ),
        list
      );
    })()
  );

  // Updates-Listener registrieren
  let removeUpdateListener = () => {};
  if (window.electronAPI) {
    removeUpdateListener = window.electronAPI.onUpdateStatus((ev, info) => {
      if (info.status === 'available') {
        updateInfoEl.innerHTML = `<span style="color:#00d4c8;">🔄 Neue Version v${info.version} verfügbar — wird geladen…</span>`;
      } else if (info.status === 'downloading') {
        updateInfoEl.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:6px;">
            <span>⬇️ Update wird heruntergeladen (${info.percent}%)</span>
            <div style="height:6px; background:#1d1330; border-radius:3px; overflow:hidden;">
              <div style="width:${info.percent}%; height:100%; background:linear-gradient(90deg,#00d4c8,#d4a200);"></div>
            </div>
          </div>`;
      } else if (info.status === 'ready') {
        updateInfoEl.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #00d4c8; padding:10px; border-radius:8px; background:rgba(0,212,200,.05);">
            <span style="color:#2dd66e; font-weight:600;">✅ v${info.version} bereit</span>
            <button class="btn" style="background:linear-gradient(90deg,#00d4c8,#d4a200); color:#06000e; font-weight:700; border:none; padding:4px 10px; font-size:12px;" onclick="window.electronAPI.installNow()">Neustart & Installieren</button>
          </div>`;
      } else if (info.status === 'error') {
        updateInfoEl.innerHTML = `<span style="color:#ff8080;">❌ Fehler: ${info.message}</span>`;
      } else if (info.status === 'channel-changed') {
        updateInfoEl.innerHTML = `<span style="color:#9a8fb5;">Kanal gewechselt auf: ${info.channel === 'beta' ? 'dev/beta' : 'prod/stable'}. Suche läuft...</span>`;
      }
    });
  }

  // Header Elements
  const paneTitleEl = el('div', { class: 'settings-pane-title' }, 'Mein Profil');
  const paneDescEl = el('div', { class: 'settings-pane-desc' }, 'Verwalte dein Benutzerprofil und melde dich ab.');

  // Tabs Definitions
  const tabs = [
    { id: 'profile', icon: '👤', label: 'Mein Profil', pane: paneProfil, title: 'Mein Profil', desc: 'Verwalte dein Benutzerprofil und melde dich ab.' },
    { id: 'keys', icon: '🔑', label: 'API-Keys', pane: paneKeys, title: 'API-Keys & Webhooks', desc: 'Konfiguriere Schlüssel und Webhooks im Vault.' },
  ];
  if (window.electronAPI) {
    tabs.push({ id: 'updates', icon: '⚙️', label: 'Updates', pane: paneUpdates, title: 'App-Updates', desc: 'Verwalte den Update-Kanal und suche nach neuen Versionen.' });
  }

  // Sidebar Buttons
  const sidebarButtons = tabs.map(t => {
    const btn = el('button', {
      class: 'settings-tab-btn' + (t.id === 'profile' ? ' active' : ''),
      'data-tab': t.id,
      onclick: () => switchTab(t.id)
    }, `${t.icon} ${t.label}`);
    return btn;
  });

  function switchTab(tabId) {
    sidebarButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    const tab = tabs.find(t => t.id === tabId);
    paneTitleEl.textContent = tab.title;
    paneDescEl.textContent = tab.desc;
    tabs.forEach(t => {
      t.pane.style.display = t.id === tabId ? 'block' : 'none';
    });
    // Footer Speichern-Button nur für Keys anzeigen
    saveKeysBtn.style.display = tabId === 'keys' ? 'block' : 'none';
  }

  // Actions
  const saveKeysBtn = el('button', {
    class: 'btn',
    style: 'display:none; background:linear-gradient(90deg,#00d4c8,#d4a200); color:#06000e; font-weight:700; border:none;',
    onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'speichern…';
      let saved = 0; let errors = 0;
      const inputs = document.querySelectorAll('#setup-fields input[data-key]');
      for (const inp of inputs) {
        const val = inp.value.trim();
        if (!val) continue;
        try {
          await saveToVault(inp.dataset.key, val, inp.dataset.service);
          saved++;
          inp.value = '';
          inp.placeholder = '(bereits gesetzt — leer lassen zum Beibehalten)';
          const badge = inp.closest('.field').querySelector('label span:nth-child(2)');
          if (badge) {
            badge.textContent = '✓ gesetzt';
            badge.style.color = '#2dd66e';
          }
        } catch (err) {
          toast(`${inp.dataset.key}: ${err.message}`, 'fail');
          errors++;
        }
      }
      btn.disabled = false; btn.textContent = 'speichern';
      if (saved > 0) toast(`${saved} Wert${saved !== 1 ? 'e' : ''} gespeichert`, 'ok');
    }
  }, 'speichern');

  const closeBtn = el('button', {
    class: 'btn ghost',
    style: 'border-color:#2a1d44; color:#9a8fb5;',
    onclick: () => {
      removeUpdateListener();
      overlay.remove();
      _onComplete?.();
    }
  }, 'schließen');

  const overlay = el('div', {
    id: 'setup-wizard-overlay',
    class: 'settings-overlay',
  },
    el('div', { class: 'settings-shell' },
      // Sidebar
      el('div', { class: 'settings-sidebar' },
        el('div', { class: 'settings-sidebar-header' }, '✋ Einstellungen'),
        ...sidebarButtons
      ),
      // Content Area
      el('div', { class: 'settings-content-pane' },
        el('div', { class: 'settings-pane-header' },
          paneTitleEl,
          paneDescEl
        ),
        el('div', { class: 'settings-pane-body' },
          paneProfil,
          paneKeys,
          paneUpdates
        ),
        el('div', { class: 'settings-pane-footer' },
          saveKeysBtn,
          closeBtn
        )
      )
    )
  );

  document.getElementById('setup-wizard-overlay')?.remove();
  document.body.append(overlay);
}

export function initSetupButton() {
  const foot = document.getElementById('sidebar-foot-label');
  if (!foot) return;
  const btn = el('button', {
    style: 'background:none;border:none;color:#6f6488;cursor:pointer;font-size:11px;' +
           'margin-left:8px;padding:0;text-decoration:underline;',
    title: 'Optionale Einstellungen',
    onclick: async () => {
      const status = await loadStatus().catch(() => null);
      showSetupWizard(status, true);
    },
  }, '⚙ setup');
  foot.parentElement?.append(btn);
}
