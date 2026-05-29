import { api } from '../shared/api.js';
import { $, el, toast, detectType, isMeta, confirmDanger } from '../shared/ui.js';

let current = null;
let onChange = null;

function fieldFor(key, value) {
  const t = detectType(value);
  const ro = isMeta(key);
  const wrap = el('div', { class: 'field' + (ro ? ' readonly' : '') });
  wrap.append(el('label', {},
    el('span', {}, key),
    el('span', { class: 'type-tag' }, t),
  ));

  if (t === 'object' || t === 'array') {
    const ta = el('textarea', { 'data-key': key, 'data-type': t, readonly: ro || false },
      JSON.stringify(value, null, 2));
    wrap.append(ta);
  } else if (t === 'boolean') {
    const sel = el('select', { 'data-key': key, 'data-type': t, disabled: ro || false },
      el('option', { value: 'true', selected: value === true || undefined }, 'true'),
      el('option', { value: 'false', selected: value === false || undefined }, 'false'),
    );
    wrap.append(sel);
  } else {
    const inp = el('input', {
      type: t === 'number' ? 'number' : 'text',
      'data-key': key, 'data-type': t,
      value: value == null ? '' : String(value),
      readonly: ro || false,
    });
    wrap.append(inp);
  }
  return wrap;
}

function buildFields(doc) {
  const wrap = $('#drawer-fields');
  wrap.replaceChildren();
  const meta = Object.keys(doc).filter(isMeta);
  const data = Object.keys(doc).filter(k => !isMeta(k));
  for (const k of [...meta, ...data]) {
    wrap.append(fieldFor(k, doc[k]));
  }
  $('#drawer-raw').value = JSON.stringify(doc, null, 2);
}

function collectFromFields() {
  const out = {};
  for (const node of $('#drawer-fields').querySelectorAll('[data-key]')) {
    const k = node.dataset.key;
    const t = node.dataset.type;
    let raw = node.value;
    if (isMeta(k)) { out[k] = current[k]; continue; }
    if (t === 'null') { out[k] = null; continue; }
    if (t === 'object' || t === 'array') {
      try { out[k] = raw.trim() === '' ? null : JSON.parse(raw); }
      catch (e) { throw new Error(`${k}: ungültiges JSON (${e.message})`); }
    } else if (t === 'number') {
      out[k] = raw === '' ? null : Number(raw);
    } else if (t === 'boolean') {
      out[k] = raw === 'true';
    } else {
      out[k] = raw;
    }
  }
  return out;
}

export async function openEditor(rid, refresh) {
  if (!rid) return;
  onChange = refresh;
  $('#drawer-rid').textContent = rid;
  $('#drawer-fields').replaceChildren(el('div', { class: 'cls-super' }, 'lade…'));
  $('#drawer').classList.add('open');
  $('#drawer-backdrop').classList.add('open');
  try {
    current = await api.get(rid);
    buildFields(current);
  } catch (e) {
    toast(`Laden fehlgeschlagen: ${e.message}`, 'fail');
    closeEditor();
  }
}

export function closeEditor() {
  $('#drawer').classList.remove('open');
  $('#drawer-backdrop').classList.remove('open');
  current = null;
}

export function initEditor() {
  $('#drawer-close').addEventListener('click', closeEditor);
  $('#drawer-backdrop').addEventListener('click', closeEditor);

  $('#drawer-save').addEventListener('click', async () => {
    if (!current) return;
    let doc;
    try {
      const raw = $('#drawer-raw').value.trim();
      const useRaw = raw && raw !== JSON.stringify(current, null, 2);
      doc = useRaw ? JSON.parse(raw) : collectFromFields();
    } catch (e) {
      toast(e.message, 'fail');
      return;
    }
    try {
      await api.update(current['@rid'], doc);
      toast('gespeichert', 'ok');
      onChange?.();
      closeEditor();
    } catch (e) {
      toast(`Speichern fehlgeschlagen: ${e.message}`, 'fail');
    }
  });

  $('#drawer-delete').addEventListener('click', async () => {
    if (!current) return;
    if (!confirmDanger(`Record ${current['@rid']} wirklich löschen?`)) return;
    try {
      await api.remove(current['@rid']);
      toast('gelöscht', 'ok');
      onChange?.();
      closeEditor();
    } catch (e) {
      toast(`Löschen fehlgeschlagen: ${e.message}`, 'fail');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeEditor();
  });
}
