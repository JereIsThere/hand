// public/tools/roadmaps.js — GitHub-backed Roadmap View (ES module)
// Reads roadmap.REPO.md files from GitHub via /api/roadmaps/github.
// Milestones rendered as a vertical timeline stack within each project panel.

// ── State ─────────────────────────────────────────────────────────────────────
let ghData = { projects: [], milestones: [], tasks: [] };
let hiddenCats = new Set();
let initialized = false;
let loading = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
const escHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// localStorage keys
const msCKey  = (repoId, msIdx) => `rm-ms-${repoId}-${msIdx}`;
const isMsCollapsed = (repoId, msIdx) => localStorage.getItem(msCKey(repoId, msIdx)) === '1';
const setMsCollapsed = (repoId, msIdx, val) => {
  if (val) localStorage.setItem(msCKey(repoId, msIdx), '1');
  else     localStorage.removeItem(msCKey(repoId, msIdx));
};

const projCKey    = (id) => `roadmaps-collapsed-${id}`;
const isProjColl  = (id) => localStorage.getItem(projCKey(id)) === '1';
const setProjColl = (id, val) => {
  if (val) localStorage.setItem(projCKey(id), '1');
  else     localStorage.removeItem(projCKey(id));
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
  const collapsed = isProjColl(p.id);

  if (collapsed) {
    return `
      <div class="roadmap-panel collapsed gh-project" data-proj="${p.id}"
        style="border-top:3px solid ${color};cursor:pointer" title="Aufklappen">
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
        <div class="milestones-stack">
          ${milestones.map((m, idx) => renderMilestone(m, p, idx)).join('')}
        </div>
      </div>
    </div>`;
}

function renderMilestone(m, p, msIdx) {
  const tasks = ghData.tasks.filter((t) => t.milestoneId === m.id);
  const doneCount  = tasks.filter((t) => t.status === 'done').length;
  const totalCount = tasks.length;
  const allDone    = totalCount > 0 && doneCount === totalCount;
  const isNow      = m.isNow;

  // Determine state
  let state, icon, stateClass;
  if (allDone) {
    state = 'done';    icon = '✓'; stateClass = 'is-done';
  } else if (isNow) {
    state = 'now';     icon = '◀'; stateClass = 'is-now';
  } else {
    state = 'future';  icon = '○'; stateClass = 'is-future';
  }

  // Collapse logic: NOW is always expanded; others default collapsed
  const collapsed = isNow ? false : isMsCollapsed(p.id, msIdx);

  return `
    <div class="milestone-row ${stateClass}" data-ms-proj="${escHtml(p.id)}" data-ms-idx="${msIdx}" data-ms-state="${state}">
      <div class="milestone-header">
        <span class="milestone-icon">${icon}</span>
        <span class="milestone-name">${escHtml(m.name)}</span>
        ${totalCount > 0
          ? `<span class="milestone-count">${doneCount}/${totalCount}</span>`
          : ''}
      </div>
      <div class="milestone-tasks${collapsed ? ' hidden' : ''}">
        ${tasks.map((t) => renderTask(t, p.id)).join('')}
        ${tasks.length === 0 ? '<span style="color:var(--ink-soft);font-size:0.78rem">Keine Tasks</span>' : ''}
      </div>
    </div>`;
}

function renderTask(t, repoId) {
  const done = t.status === 'done';
  return `
    <div class="task-row ${done ? 'done' : ''}">
      <input type="checkbox" class="gh-task-check"
        data-index="${t.index}" data-repo="${escHtml(repoId)}"
        ${done ? 'checked' : ''} />
      <span>${escHtml(t.title)}</span>
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

  // Project: collapse button
  root.querySelectorAll('.rm-collapse').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setProjColl(btn.dataset.proj, true);
      render();
    });
  });

  // Project: expand collapsed panel
  root.querySelectorAll('.roadmap-panel.collapsed').forEach((panel) => {
    panel.addEventListener('click', () => {
      setProjColl(panel.dataset.proj, false);
      render();
    });
  });

  // Milestone header: click → toggle tasks (unless NOW)
  root.querySelectorAll('.milestone-row').forEach((row) => {
    const header = row.querySelector('.milestone-header');
    if (!header) return;
    header.addEventListener('click', () => {
      if (row.dataset.msState === 'now') return; // NOW always stays expanded
      const tasks = row.querySelector('.milestone-tasks');
      if (!tasks) return;
      const repoId = row.closest('.gh-project')?.dataset.proj;
      const msIdx  = parseInt(row.dataset.msIdx, 10);
      const nowHidden = tasks.classList.contains('hidden');
      tasks.classList.toggle('hidden', !nowHidden);
      setMsCollapsed(repoId, msIdx, !nowHidden);
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
        msg.style.cssText =
          'position:fixed;bottom:20px;right:20px;background:#f03;color:#fff;' +
          'padding:10px 16px;border-radius:8px;z-index:9999;font-size:13px';
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
  await loadGithubRoadmaps();
}

export function activateRoadmaps() {
  if (!initialized) { initRoadmaps(); return; }
  if (!loading) loadGithubRoadmaps();
}

export function deactivateRoadmaps() {}
