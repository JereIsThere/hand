import { el } from '../shared/ui.js';

let current = null;

export function me() { return current; }
export function isAdmin() { return current?.role === 'admin'; }

// Liest /api/me. Liefert { ok } — bei ok=false ist ein Overlay (Login/Pending)
// sichtbar und der Rest der App soll NICHT booten.
export async function initAuth() {
  let data;
  try {
    data = await fetch('/api/me').then((r) => r.json());
  } catch {
    // Server nicht erreichbar -> wie lokal-offen behandeln, damit die Shell lädt.
    data = { authEnabled: false, user: { email: 'operator', name: 'Operator', role: 'admin', status: 'approved' } };
  }
  current = data.user;

  if (!data.authEnabled) return { ok: true };
  if (!current) { showLogin(); return { ok: false }; }
  if (current.status !== 'approved') { showPending(current); return { ok: false }; }
  return { ok: true };
}

function overlay(...children) {
  document.querySelector('.auth-overlay')?.remove();
  const box = el('div', {
    class: 'auth-overlay',
    style:
      'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(circle at 50% 30%,#0b0418,#06000e 70%);padding:24px;',
  },
    el('div', {
      style:
        'width:min(420px,100%);background:#0e0820;border:1px solid #1d1330;border-radius:18px;' +
        'padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.6);text-align:center;' +
        'font-family:Georgia,serif;color:#e8e0f0;',
    }, ...children)
  );
  document.body.append(box);
}

function sigil() {
  return el('div', { style: 'font-size:42px;margin-bottom:8px;' }, '✋');
}

function showLogin() {
  overlay(
    sigil(),
    el('div', { style: 'font-size:26px;font-weight:700;letter-spacing:-.5px;' }, 'Die Hand'),
    el('p', { style: 'color:#9a8fb5;margin:10px 0 22px;font-size:15px;' },
      'Zutritt nur für den Freundeskreis. Melde dich mit Google an.'),
    el('a', {
      href: '/auth/login',
      style:
        'display:inline-block;background:linear-gradient(90deg,#00d4c8,#d4a200);color:#06000e;' +
        'font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;font-family:system-ui,sans-serif;',
    }, 'Mit Google anmelden'),
  );
}

function showPending(u) {
  overlay(
    sigil(),
    el('div', { style: 'font-size:22px;font-weight:700;' }, 'Fast da.'),
    el('p', { style: 'color:#9a8fb5;margin:12px 0 6px;font-size:15px;' },
      'Deine Anfrage wartet auf Freigabe durch den Admin.'),
    el('p', { style: 'color:#6f6488;font-size:13px;margin-bottom:22px;' }, u.email),
    el('button', {
      style:
        'background:none;border:1px solid #2a1d44;color:#9a8fb5;padding:9px 18px;border-radius:9px;' +
        'cursor:pointer;font-family:system-ui,sans-serif;',
      onclick: async () => { await fetch('/auth/logout', { method: 'POST' }); location.reload(); },
    }, 'abmelden'),
  );
}
