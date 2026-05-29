import { api } from '../shared/api.js';
import { $, el, toast } from '../shared/ui.js';

function classKind(cls) {
  const supers = (cls.superClasses || []).concat(cls.superClass ? [cls.superClass] : []);
  if (supers.includes('V')) return 'V';
  if (supers.includes('E')) return 'E';
  return '';
}

function propRow(p) {
  return el('tr', {},
    el('td', {}, p.name),
    el('td', {}, p.type || '—'),
    el('td', {}, p.mandatory ? 'yes' : ''),
    el('td', {}, p.notNull ? 'yes' : ''),
    el('td', {}, p.linkedClass || p.linkedType || ''),
  );
}

function renderCard(cls) {
  const kind = classKind(cls);
  const supers = (cls.superClasses || []).concat(cls.superClass ? [cls.superClass] : []).filter(Boolean);
  const props = cls.properties || [];
  const indexes = cls.indexes || [];

  return el('details', { class: 'schema-card' },
    el('summary', {},
      kind && el('span', { class: `pill ${kind.toLowerCase()}` }, kind),
      el('span', { class: 'cls-name' }, cls.name),
      supers.length ? el('span', { class: 'cls-super' }, '⟵ ' + supers.join(', ')) : null,
      el('span', { class: 'cls-count' }, `${cls.records ?? '?'} records · ${props.length} props`),
    ),
    el('div', { class: 'schema-body' },
      el('h4', {}, 'Properties'),
      props.length
        ? el('table', { class: 'prop-table' },
            el('thead', {}, el('tr', {},
              el('th', {}, 'name'), el('th', {}, 'type'),
              el('th', {}, 'mandatory'), el('th', {}, 'notNull'),
              el('th', {}, 'linked'),
            )),
            el('tbody', {}, ...props.map(propRow)),
          )
        : el('div', { class: 'cls-super' }, '— keine —'),
      indexes.length ? el('h4', {}, 'Indexes') : null,
      indexes.length
        ? el('table', { class: 'prop-table' },
            el('thead', {}, el('tr', {},
              el('th', {}, 'name'), el('th', {}, 'type'), el('th', {}, 'fields'),
            )),
            el('tbody', {}, ...indexes.map(ix =>
              el('tr', {},
                el('td', {}, ix.name),
                el('td', {}, ix.type),
                el('td', {}, (ix.fields || []).join(', ')),
              ))),
          )
        : null,
    ),
  );
}

export async function loadSchema() {
  const target = $('#schema-list');
  target.replaceChildren(el('div', { class: 'cls-super' }, 'lade Schema…'));
  try {
    const classes = await api.classes();
    const sorted = [...classes].sort((a, b) => {
      const ak = classKind(a), bk = classKind(b);
      if (ak !== bk) return ak === 'V' ? -1 : bk === 'V' ? 1 : ak === 'E' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    target.replaceChildren(...sorted.map(renderCard));
    return sorted;
  } catch (e) {
    target.replaceChildren(el('div', { class: 'cls-super' }, `Fehler: ${e.message}`));
    toast(`Schema-Fehler: ${e.message}`, 'fail');
    return [];
  }
}
