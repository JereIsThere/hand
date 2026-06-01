import { $, el, toast } from '../shared/ui.js';

// Setup-Wizard: fragt alle optionalen Config-Keys ab und speichert sie im Vault.
// Zeigt automatisch beim ersten Login wenn Keys fehlen — oder manuell via
// showSetupWizard().

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

function renderGroup(groupName, items, savedValues) {
  const rows = items.map(item => {
    const inputId = `setup-${item.key}`;
    const stored = savedValues[item.key] || '';
    const badge = item.set
      ? el('span', { style: 'color:#2dd66e;font-size:11px;' }, '✓ gesetzt')
      : el('span', { style: 'color:#888;font-size:11px;' }, 'fehlt');

    const input = el('input', {
      id: inputId,
      type: item.secret ? 'password' : 'text',
      placeholder: item.set ? '(bereits gesetzt — leer lassen zum Beibehalten)' : item.placeholder,
      autocomplete: 'off',
      style: 'font-family:monospace;',
      'data-key': item.key,
      'data-service': item.service,
    });

    const revealBtn = item.secret ? el('button', {
      class: 'btn ghost',
      type: 'button',
      style: 'padding:2px 8px;font-size:12px;flex-shrink:0;',
      onclick: () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        revealBtn.textContent = input.type === 'password' ? '👁' : '🙈';
      },
    }, '👁') : null;

    const hint = item.bootstrapHint
      ? el('small', { style: 'color:#ff9500;display:block;margin-top:4px;' },
          '⚠ Bootstrap-Secret — besser in .env statt im Vault (wird vor OrientDB gebraucht).')
      : null;

    return el('div', { class: 'field', style: 'margin-bottom:14px;' },
      el('label', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px;' },
        el('span', { style: 'font-weight:600;' }, item.label),
        badge,
      ),
      el('small', { style: 'color:#888;display:block;margin-bottom:6px;' }, item.description),
      el('div', { style: 'display:flex;gap:6px;align-items:stretch;' },
        input,
        revealBtn,
      ).querySelector ? (() => {
        const wrap = el('div', { style: 'display:flex;gap:6px;align-items:stretch;' }, input);
        if (revealBtn) wrap.append(revealBtn);
        return wrap;
      })() : el('div', { style: 'display:flex;gap:6px;' }, input, ...(revealBtn ? [revealBtn] : [])),
      ...(hint ? [hint] : []),
    );
  });

  return el('div', { style: 'margin-bottom:24px;' },
    el('div', {
      style: 'font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9a8fb5;' +
             'margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #1d1330;',
    }, groupName),
    ...rows,
  );
}

export async function checkAndShowSetupWizard(force = false) {
  let status;
  try { status = await loadStatus(); } catch { return; }
  if (!status) return;
  if (!force && status.missing === 0) return;
  showSetupWizard(status, force);
}

export function showSetupWizard(status, force = false) {
  const { items } = status || { items: [] };

  // Gruppieren
  const groups = {};
  for (const item of items) {
    (groups[item.group] ||= []).push(item);
  }

  const groupEls = Object.entries(groups).map(([name, grpItems]) =>
    renderGroup(name, grpItems, {})
  );

  const overlay = el('div', {
    id: 'setup-wizard-overlay',
    style: 'position:fixed;inset:0;z-index:3000;display:flex;align-items:flex-start;' +
           'justify-content:center;background:rgba(6,0,14,.92);padding:24px;overflow-y:auto;',
  },
    el('div', {
      style: 'width:min(640px,100%);background:#0e0820;border:1px solid #1d1330;' +
             'border-radius:18px;padding:32px;margin:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);',
    },
      // Header
      el('div', { style: 'margin-bottom:28px;' },
        el('div', { style: 'font-size:32px;margin-bottom:6px;' }, '✋'),
        el('h2', { style: 'font-size:22px;font-weight:700;margin-bottom:8px;color:#e8e0f0;' },
          force ? 'Einstellungen' : 'Willkommen — Setup'),
        el('p', { style: 'color:#9a8fb5;font-size:14px;line-height:1.6;' },
          force
            ? 'Optionale Konfiguration. Leer lassen = Wert beibehalten oder nicht setzen.'
            : `${status.missing} optionale Wert${status.missing !== 1 ? 'e' : ''} noch nicht gesetzt. ` +
              'Alle Eingaben landen verschlüsselt im Vault — kein .env-Anfassen.'),
      ),

      // Felder pro Gruppe
      el('div', { id: 'setup-fields' }, ...groupEls),

      // Footer
      el('div', { style: 'display:flex;gap:12px;justify-content:flex-end;margin-top:8px;' },
        el('button', {
          class: 'btn ghost',
          onclick: () => { document.getElementById('setup-wizard-overlay')?.remove(); _onComplete?.(); },
        }, force ? 'schließen' : 'überspringen'),
        el('button', {
          class: 'btn',
          style: 'background:linear-gradient(90deg,#00d4c8,#d4a200);color:#06000e;font-weight:700;border:none;',
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true; btn.textContent = 'speichern…';
            let saved = 0; let errors = 0;
            const inputs = document.querySelectorAll('#setup-fields input[data-key]');
            for (const inp of inputs) {
              const val = inp.value.trim();
              if (!val) continue; // leer = überspringen
              try {
                await saveToVault(inp.dataset.key, val, inp.dataset.service);
                saved++;
              } catch (err) {
                toast(`${inp.dataset.key}: ${err.message}`, 'fail');
                errors++;
              }
            }
            btn.disabled = false; btn.textContent = 'speichern';
            if (saved > 0) toast(`${saved} Wert${saved !== 1 ? 'e' : ''} gespeichert`, 'ok');
            if (errors === 0) {
              setTimeout(() => {
                document.getElementById('setup-wizard-overlay')?.remove();
                _onComplete?.();
              }, 600);
            }
          },
        }, 'speichern'),
      ),
    ),
  );

  document.getElementById('setup-wizard-overlay')?.remove();
  document.body.append(overlay);
}

// Einstellungs-Button in der Sidebar-Fußzeile
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
