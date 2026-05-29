export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(message, kind = '') {
  const t = el('div', { class: `toast ${kind}` }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

export function formatCell(value) {
  if (value === null || value === undefined) return { text: '—', cls: 'null-cell' };
  if (typeof value === 'boolean') return { text: String(value), cls: 'bool-cell' };
  if (typeof value === 'number')  return { text: String(value), cls: 'num-cell' };
  if (typeof value === 'string') {
    if (/^#-?\d+:\d+$/.test(value)) return { text: value, cls: 'rid-cell' };
    return { text: value, cls: '' };
  }
  if (Array.isArray(value)) return { text: `[${value.length}]`, cls: 'obj-cell' };
  if (typeof value === 'object') {
    if (value['@rid']) return { text: value['@rid'], cls: 'rid-cell' };
    return { text: `{${Object.keys(value).length}}`, cls: 'obj-cell' };
  }
  return { text: String(value), cls: '' };
}

export function detectType(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v))   return 'array';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

export function isMeta(key) { return key.startsWith('@'); }

export function confirmDanger(message) {
  return window.confirm(message);
}
