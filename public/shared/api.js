async function json(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.error) || (typeof data === 'string' ? data : `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

export const api = {
  info:    ()       => fetch('/api/info').then(json),
  classes: ()       => fetch('/api/classes').then(json),
  records: (cls, { limit = 50, skip = 0, order } = {}) => {
    const p = new URLSearchParams({ class: cls, limit, skip });
    if (order) p.set('order', order);
    return fetch(`/api/records?${p}`).then(json);
  },
  count:   (cls)    => fetch(`/api/count?class=${encodeURIComponent(cls)}`).then(json),
  get:     (rid)    => fetch(`/api/record/${encodeURIComponent(rid.replace(/^#/, ''))}`).then(json),
  update:  (rid, doc) => fetch(`/api/record/${encodeURIComponent(rid.replace(/^#/, ''))}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  }).then(json),
  remove:  (rid)    => fetch(`/api/record/${encodeURIComponent(rid.replace(/^#/, ''))}`, { method: 'DELETE' }).then(json),
  query:   (command, language = 'sql') => fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, language }),
  }).then(json),
};
