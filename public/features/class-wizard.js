import { api } from '../shared/api.js';
import { $, $$, el, toast } from '../shared/ui.js';

const TYPES = [
  'STRING', 'INTEGER', 'LONG', 'FLOAT', 'DOUBLE', 'BOOLEAN',
  'DATE', 'DATETIME', 'EMBEDDED', 'EMBEDDEDLIST', 'EMBEDDEDMAP', 'LINK', 'LINKLIST',
];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

let state, step, onChange;

function reset() {
  state = {
    name: '',
    kind: 'V',
    superExtra: '',
    props: [{ name: '', type: 'STRING', mandatory: false, notNull: false }],
    rows: [],
  };
  step = 1;
}

function setStep(n) {
  step = Math.max(1, Math.min(4, n));
  $$('.wizard-step').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === step));
  $$('.wizard-steps .step').forEach(s => {
    const i = Number(s.dataset.step);
    s.classList.toggle('active', i === step);
    s.classList.toggle('done', i < step);
  });
  const titles = ['', 'Schritt 1 · Basics', 'Schritt 2 · Properties', 'Schritt 3 · Erst-Datensätze', 'Schritt 4 · Vorschau'];
  $('#wizard-title').textContent = titles[step];
  $('#wiz-prev').disabled = step === 1;
  $('#wiz-next').classList.toggle('hidden', step === 4);
  $('#wiz-run').classList.toggle('hidden', step !== 4);

  if (step === 3) renderRowsHeader();
  if (step === 4) renderPreview();
}

function renderPropsTable() {
  const tbody = $('#wiz-props tbody');
  tbody.replaceChildren();
  state.props.forEach((p, i) => {
    const row = el('tr', {},
      el('td', {}, el('input', {
        value: p.name, placeholder: 'name',
        oninput: (e) => { p.name = e.target.value; },
      })),
      el('td', {}, el('select', {
        onchange: (e) => { p.type = e.target.value; },
      }, ...TYPES.map(t => el('option', { value: t, selected: t === p.type || undefined }, t)))),
      el('td', { class: 'check' }, el('input', {
        type: 'checkbox', checked: p.mandatory || undefined,
        onchange: (e) => { p.mandatory = e.target.checked; },
      })),
      el('td', { class: 'check' }, el('input', {
        type: 'checkbox', checked: p.notNull || undefined,
        onchange: (e) => { p.notNull = e.target.checked; },
      })),
      el('td', { class: 'actions' }, el('button', {
        class: 'row-del', title: 'Zeile löschen',
        onclick: () => { state.props.splice(i, 1); renderPropsTable(); },
      }, '×')),
    );
    tbody.append(row);
  });
}

function renderRowsHeader() {
  const validProps = state.props.filter(p => IDENT.test(p.name));
  const thead = $('#wiz-rows thead tr');
  thead.replaceChildren(
    ...validProps.map(p => el('th', { title: p.type }, p.name)),
    el('th', { class: 'actions' }, ''),
  );
  if (state.rows.length === 0) addRow();
  else renderRowsBody();
}

function renderRowsBody() {
  const validProps = state.props.filter(p => IDENT.test(p.name));
  const tbody = $('#wiz-rows tbody');
  tbody.replaceChildren();
  state.rows.forEach((r, i) => {
    const tr = el('tr');
    for (const p of validProps) {
      tr.append(el('td', {}, el('input', {
        value: r[p.name] ?? '',
        placeholder: p.type.toLowerCase(),
        oninput: (e) => { r[p.name] = e.target.value; },
      })));
    }
    tr.append(el('td', { class: 'actions' }, el('button', {
      class: 'row-del', title: 'Zeile löschen',
      onclick: () => { state.rows.splice(i, 1); renderRowsBody(); },
    }, '×')));
    tbody.append(tr);
  });
}

function addRow() {
  state.rows.push({});
  renderRowsBody();
}

function quoteIdent(s) {
  if (!IDENT.test(s)) throw new Error(`ungültiger Identifier: ${s}`);
  return '`' + s + '`';
}

function coerceValue(raw, type) {
  if (raw === '' || raw == null) return undefined;
  switch (type) {
    case 'INTEGER': case 'LONG': {
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) throw new Error(`${type}: "${raw}" ist keine Zahl`);
      return n;
    }
    case 'FLOAT': case 'DOUBLE': {
      const n = parseFloat(raw);
      if (Number.isNaN(n)) throw new Error(`${type}: "${raw}" ist keine Zahl`);
      return n;
    }
    case 'BOOLEAN': {
      if (/^(true|1|ja|yes)$/i.test(raw)) return true;
      if (/^(false|0|nein|no)$/i.test(raw)) return false;
      throw new Error(`BOOLEAN: "${raw}" muss true/false sein`);
    }
    case 'EMBEDDED': case 'EMBEDDEDLIST': case 'EMBEDDEDMAP': case 'LINKLIST': {
      try { return JSON.parse(raw); }
      catch { throw new Error(`${type}: "${raw}" ist kein gültiges JSON`); }
    }
    default: return String(raw);
  }
}

function buildStatements() {
  if (!IDENT.test(state.name)) throw new Error('Klassen-Name fehlt oder ungültig');

  const supers = [];
  if (state.kind) supers.push(state.kind);
  if (state.superExtra) supers.push(state.superExtra);
  const extendsClause = supers.length ? ` EXTENDS ${supers.map(quoteIdent).join(', ')}` : '';

  const stmts = [];
  stmts.push({ label: `CREATE CLASS ${state.name}`, sql: `CREATE CLASS ${quoteIdent(state.name)}${extendsClause}` });

  const validProps = state.props.filter(p => p.name.trim() || p.mandatory || p.notNull);
  for (const p of validProps) {
    if (!IDENT.test(p.name)) throw new Error(`Property-Name ungültig: "${p.name}"`);
    if (!TYPES.includes(p.type)) throw new Error(`Property-Type ungültig: "${p.type}"`);
    stmts.push({
      label: `CREATE PROPERTY ${p.name} ${p.type}`,
      sql: `CREATE PROPERTY ${quoteIdent(state.name)}.${quoteIdent(p.name)} ${p.type}`,
    });
    if (p.mandatory) stmts.push({
      label: `${p.name} MANDATORY`,
      sql: `ALTER PROPERTY ${quoteIdent(state.name)}.${quoteIdent(p.name)} MANDATORY TRUE`,
    });
    if (p.notNull) stmts.push({
      label: `${p.name} NOTNULL`,
      sql: `ALTER PROPERTY ${quoteIdent(state.name)}.${quoteIdent(p.name)} NOTNULL TRUE`,
    });
  }

  const typeByName = Object.fromEntries(validProps.map(p => [p.name, p.type]));
  for (let i = 0; i < state.rows.length; i++) {
    const r = state.rows[i];
    const obj = {};
    for (const [k, raw] of Object.entries(r)) {
      if (!IDENT.test(k)) continue;
      const v = coerceValue(raw, typeByName[k] || 'STRING');
      if (v !== undefined) obj[k] = v;
    }
    if (Object.keys(obj).length === 0) continue;
    stmts.push({
      label: `INSERT row ${i + 1}`,
      sql: `INSERT INTO ${quoteIdent(state.name)} CONTENT ${JSON.stringify(obj)}`,
    });
  }
  return stmts;
}

function renderPreview() {
  try {
    const stmts = buildStatements();
    $('#wiz-preview').textContent = stmts.map(s => s.sql + ';').join('\n');
    $('#wiz-progress').replaceChildren();
    $('#wiz-run').disabled = false;
  } catch (e) {
    $('#wiz-preview').textContent = `// Fehler in Eingabe:\n// ${e.message}`;
    $('#wiz-progress').replaceChildren();
    $('#wiz-run').disabled = true;
  }
}

async function runWizard() {
  let stmts;
  try { stmts = buildStatements(); }
  catch (e) { toast(e.message, 'fail'); return; }

  const progress = $('#wiz-progress');
  const lines = stmts.map(s => el('div', { class: 'step-line pending' }, s.label));
  progress.replaceChildren(...lines);

  $('#wiz-run').disabled = true;
  $('#wiz-prev').disabled = true;
  $('#wizard-close').disabled = true;

  for (let i = 0; i < stmts.length; i++) {
    lines[i].className = 'step-line run';
    try {
      await api.query(stmts[i].sql, 'sql');
      lines[i].className = 'step-line ok';
    } catch (e) {
      lines[i].className = 'step-line err';
      lines[i].append(el('span', { class: 'muted' }, ` — ${e.message}`));
      toast(`Abgebrochen bei: ${stmts[i].label}`, 'fail');
      $('#wiz-prev').disabled = false;
      $('#wizard-close').disabled = false;
      return;
    }
  }
  toast(`Klasse "${state.name}" angelegt (${stmts.length} Statements)`, 'ok');
  closeWizard();
  onChange?.();
}

export function openWizard(existingClasses, refresh) {
  reset();
  onChange = refresh;
  const sel = $('#wiz-super');
  sel.replaceChildren(
    el('option', { value: '' }, '— keine —'),
    ...existingClasses
      .map(c => c.name)
      .filter(n => n && IDENT.test(n))
      .sort()
      .map(n => el('option', { value: n }, n)),
  );
  $('#wiz-name').value = '';
  $('#wiz-kind').value = 'V';
  renderPropsTable();
  setStep(1);
  $('#wizard').classList.add('open');
  $('#wizard').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#wiz-name').focus(), 50);
}

export function closeWizard() {
  $('#wizard').classList.remove('open');
  $('#wizard').setAttribute('aria-hidden', 'true');
  $('#wiz-prev').disabled = false;
  $('#wizard-close').disabled = false;
}

function commitStep() {
  if (step === 1) {
    state.name = $('#wiz-name').value.trim();
    state.kind = $('#wiz-kind').value;
    state.superExtra = $('#wiz-super').value;
    if (!IDENT.test(state.name)) {
      toast('Klassen-Name muss [A-Za-z_][A-Za-z0-9_]* sein', 'fail');
      return false;
    }
  }
  if (step === 2) {
    const named = state.props.filter(p => p.name.trim());
    for (const p of named) {
      if (!IDENT.test(p.name)) { toast(`Property-Name ungültig: "${p.name}"`, 'fail'); return false; }
    }
    state.props = named.length ? named : state.props;
  }
  return true;
}

export function initWizard() {
  $('#wizard-close').addEventListener('click', closeWizard);
  $('#wizard-backdrop').addEventListener('click', closeWizard);
  $('#wiz-prev').addEventListener('click', () => setStep(step - 1));
  $('#wiz-next').addEventListener('click', () => { if (commitStep()) setStep(step + 1); });
  $('#wiz-add-prop').addEventListener('click', () => {
    state.props.push({ name: '', type: 'STRING', mandatory: false, notNull: false });
    renderPropsTable();
  });
  $('#wiz-add-row').addEventListener('click', addRow);
  $('#wiz-run').addEventListener('click', runWizard);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#wizard').classList.contains('open')) closeWizard();
  });
}
