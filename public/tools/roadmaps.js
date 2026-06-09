// public/tools/roadmaps.js — GitHub-backed Roadmap View (ES module)
// Reads roadmap.REPO.md files from GitHub via /api/roadmaps/github.
// Category toggle: [● auge-framework] pill (extern stubbed, no data yet).
// Collapse state persisted per-project via localStorage.

// ── State ─────────────────────────────────────────────────────────────────────
let ghData = { projects: [], milestones: [], tasks: [] };
let hiddenCats = new Set();
let initialized = false;
let loading = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
const escHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const collapseKey = (id) => `roadmaps-collapsed-${id}`;
const isCollapsed  = (id) => localStorage.getItem(collapseKey(id)) === '1';
const setCollapsed = (id, val) => {
  if (val) localStorage.setItem(collapseKey(id), '1');
  else     localStorage.removeItem(collapseKey(id));
};

async function api(path, method = 'GET', body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return r.json();
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadGithubRoadmaps() {
  const root = document.getElementById('tool-roadmaps');
  if (!root) return;
  loading = true;
  root.innerHTML = '<div class="tool-body" style="color:var(--ink-soft);padding:24px">Lade…</div>';
  try {
    ghData = await api('/api/roadmaps/github');
    render();
  } catch (e) {
    root.innerHTML = `<div class="tool-body" style="color:var(--red);padding:24px">Fehler: ${escHtml(e.message)}</div>`;
  } finally {
    loading = false;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('tool-roadmaps');
  if (!root) return;

  // Determine categories present
  const cats = [...new Set(ghData.projects.map((p) => p.category || 'extern'))];

  root.innerHTML = `
    <div class="roadmaps-topbar">
      <div class="cat-toggles">
        ${cats.map((c) => `
          <button class="cat-toggle ${hiddenCats.has(c) ? '' : 'active'}" data-cat="${c}">
            <span>${hiddenCats.has(c) ? '○' : '●'}</span> ${c}
          </button>`).join('')}
      </div>
      <button class="btn btn-sm" id="rm-reload-btn" title="Neu laden">↺ Reload</button>
    </div>
    <div class="roadmaps-wrap" id="rm-wrap">
      ${ghData.projects
        .filter((p) => !hiddenCats.has(p.category || 'extern'))
        .map((p) => renderProject(p))
        .join('')}
      ${ghData.projects.length === 0
        ? '<div style="color:var(--ink-soft);padding:24px">Keine Roadmap-Daten gefunden.</div>'
        : ''}
    </div>
  `;

  bindAll();
}

function renderProject(p) {
  const milestones = ghData.milestones.filter((m) => m.repoId === p.id);
  const color = p.color || '#00d4c8';
  const collapsed = isCollapsed(p.id);

  if (collapsed) {
    return `
      <div class="roadmap-panel collapsed gh-project" data-proj="${p.id}"
        style="border-top:3px solid ${color};cursor:pointer"
        title="Aufklappen">
        <div class="roadmap-collapsed-title" style="color:${color}">${escHtml(p.name)}</div>
      </div>`;
  }

  return `
    <div class="roadmap-panel gh-project" data-proj="${p.id}" style="border-top:3px solid ${color}">
      <div class="roadmap-header">
        <span class="roadmap-name" style="color:${color}">${escHtml(p.name)}</span>
        <button class="btn btn-xs rm-collapse" data-proj="${p.id}" title="Einklappen">◀</button>
        <a class="btn btn-xs" href="https://github.com/JereIsThere/${p.id}" target="_blank" rel="noopener"
          style="text-decoration:none;opacity:.7" title="GitHub">↗</a>
      </div>
      <div class="roadmap-body">
        <div class="milestone-row">
          ${milestones.map((m) => renderMilestone(m, p)).join('')}
        </div>
      </div>
    </div>`;
}

function renderMilestone(m, p) {
  const tasks = ghData.tasks.filter((t) => t.milestoneId === m.id);
  const isNow = m.isNow;
  const done  = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;

  return `
    <div class="milestone-col ${isNow ? 'is-now' : ''}" data-ms="${escHtml(m.id)}">
      <div class="milestone-header">
        <span class="ms-name">${escHtml(m.name)}</span>
        ${isNow ? '<span class="now-badge" style="font-size:10px;padding:1px 6px">NOW</span>' : ''}
        ${total > 0 ? `<span style="font-size:10px;color:var(--ink-soft);margin-left:auto">${done}/${total}</span>` : ''}
      </div>
      <div class="task-list">
        ${tasks.map((t) => renderGhTask(t, p.id)).join('')}
      </div>
    </div>`;
}

function renderGhTask(t, repoId) {
  const done = t.status === 'done';
  return `
    <div class="task-card ${done ? 'done' : ''}" data-task-index="${t.index}" data-repo="${escHtml(repoId)}">
      <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;width:100%">
        <input type="checkbox" class="gh-task-check" data-index="${t.index}" data-repo="${escHtml(repoId)}"
          ${done ? 'checked' : ''} style="margin-top:2px;cursor:pointer;accent-color:var(--teal)" />
        <span class="task-title ${done ? 'task-done-title' : ''}">${escHtml(t.title)}</span>
      </label>
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────
function bindAll() {
  const root = document.getElementById('tool-roadmaps');
  if (!root) return;

  // Reload
  root.querySelector('#rm-reload-btn')?.addEventListener('click', () => {
    if (!loading) loadGithubRoadmaps();
  });

  // Category toggles
  root.querySelectorAll('.cat-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      hiddenCats.has(cat) ? hiddenCats.delete(cat) : hiddenCats.add(cat);
      render();
    });
  });

  // Collapse — header button
  root.querySelectorAll('.rm-collapse').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setCollapsed(btn.dataset.proj, true);
      render();
    });
  });

  // Expand — click on collapsed panel
  root.querySelectorAll('.roadmap-panel.collapsed').forEach((panel) => {
    panel.addEventListener('click', () => {
      setCollapsed(panel.dataset.proj, false);
      render();
    });
  });

  // Task checkbox toggle
  root.querySelectorAll('.gh-task-check').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const repoId    = cb.dataset.repo;
      const taskIndex = parseInt(cb.dataset.index, 10);

      // Optimistic update
      const task = ghData.tasks.find((t) => t.repoId === repoId && t.index === taskIndex);
      if (task) {
        task.status = cb.checked ? 'done' : 'open';
        render();
      }

      try {
        await api(`/api/roadmaps/github/${repoId}/tasks/${taskIndex}`, 'PATCH');
      } catch (e) {
        // Revert
        if (task) {
          task.status = cb.checked ? 'open' : 'done';
          render();
        }
        const msg = document.createElement('div');
        msg.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f03;color:#fff;padding:10px 16px;border-radius:8px;z-index:9999;font-size:13px';
        msg.textContent = `Fehler: ${e.message}`;
        document.body.append(msg);
        setTimeout(() => msg.remove(), 4000);
      }
    });
  });
}

// ── Lifecycle exports (main.js pattern) ──────────────────────────────────────
export async function initRoadmaps() {
  if (initialized) return;
  initialized = true;
  // pre-warm: show skeletons until data loads
  await loadGithubRoadmaps();
}

export function activateRoadmaps() {
  if (!initialized) { initRoadmaps(); return; }
  // Refresh on each activation to pick up any repo changes
  if (!loading) loadGithubRoadmaps();
}

export function deactivateRoadmaps() {}
