// public/tools/roadmaps.js — Roadmap-Cockpit Frontend (ES module)

// ── State ─────────────────────────────────────────────────────────────────────
let state = { projects: [], milestones: [], tasks: [] };
let hiddenCats = new Set();
let dragTask = null;
let initialized = false;

// ── API helpers ───────────────────────────────────────────────────────────────
const api = (path, method = 'GET', body) =>
  fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('tool-roadmaps');
  if (!root) return;

  const cats = [...new Set(state.projects.map((p) => p.category || 'extern'))];

  root.innerHTML = `
    <div class="roadmaps-topbar">
      <div class="cat-toggles">
        ${cats.map((c) => `
          <button class="cat-toggle ${hiddenCats.has(c) ? '' : 'active'}" data-cat="${c}">
            <span>${hiddenCats.has(c) ? '○' : '●'}</span> ${c}
          </button>`).join('')}
      </div>
      <button class="btn btn-sm" id="rm-add-project-btn">+ Roadmap</button>
    </div>
    <div id="rm-add-project-form" class="rm-inline-form" style="display:none">
      <input id="rm-proj-name" class="inp" placeholder="Projektname" />
      <select id="rm-proj-cat" class="inp">
        <option value="auge-framework">auge-framework</option>
        <option value="extern" selected>extern</option>
      </select>
      <button class="btn btn-sm" id="rm-proj-save">Anlegen</button>
      <button class="btn btn-sm" id="rm-proj-cancel">✕</button>
    </div>
    <div class="roadmaps-wrap" id="rm-wrap">
      ${state.projects
        .filter((p) => !hiddenCats.has(p.category || 'extern'))
        .map((p) => renderProject(p))
        .join('')}
    </div>
  `;

  bindAll();
}

function renderProject(p) {
  const milestones = state.milestones.filter((m) => m.project === p.slug);
  const color = p.color || '#00d4c8';

  if (p.collapsed) {
    return `
      <div class="roadmap-panel collapsed" data-proj="${p.slug}" style="border-top:3px solid ${color}">
        <div class="roadmap-collapsed-title">${p.name}</div>
      </div>`;
  }

  return `
    <div class="roadmap-panel" data-proj="${p.slug}" style="border-top:3px solid ${color}">
      <div class="roadmap-header">
        <span class="roadmap-name">${p.name}</span>
        <button class="btn btn-xs rm-collapse" data-proj="${p.slug}">◀</button>
        <button class="btn btn-xs rm-show-ms-form" data-proj="${p.slug}">+ M</button>
      </div>
      <div class="roadmap-body">
        <div class="milestone-row">
          ${milestones.map((m) => renderMilestone(m, p)).join('')}
          <div class="milestone-add-col">
            <div class="rm-ms-form" data-proj="${p.slug}" style="display:none">
              <input class="inp inp-sm rm-ms-name" placeholder="Milestone…" />
              <button class="btn btn-xs rm-ms-save" data-proj="${p.slug}">OK</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderMilestone(m, p) {
  const tasks = state.tasks.filter((t) => t.milestone === m.slug);
  const isNow = p.currentMilestone === m.slug;
  return `
    <div class="milestone-col drop-zone ${isNow ? 'is-now' : ''}" data-ms="${m.slug}">
      <div class="milestone-header">
        <span class="ms-name" contenteditable="true" data-ms="${m.slug}">${m.name}</span>
        <button class="btn btn-xs rm-set-now ${isNow ? 'is-now-btn' : ''}"
          data-proj="${p.slug}" data-ms="${m.slug}">◀NOW</button>
        <button class="btn btn-xs rm-del-ms" data-ms="${m.slug}">✕</button>
      </div>
      ${isNow ? '<div class="now-badge">NOW</div>' : ''}
      <div class="task-list" data-ms="${m.slug}">
        ${tasks.map((t) => renderTask(t)).join('')}
      </div>
      <div class="rm-task-footer">
        <button class="btn btn-xs rm-show-task-form" data-ms="${m.slug}">+ Task</button>
        <div class="rm-task-form" data-ms="${m.slug}" style="display:none">
          <input class="inp inp-sm rm-task-input" placeholder="Task…" />
          <button class="btn btn-xs rm-task-save" data-ms="${m.slug}">OK</button>
        </div>
      </div>
    </div>`;
}

function renderTask(t) {
  const done = t.status === 'done';
  return `
    <div class="task-card ${done ? 'done' : ''}" draggable="true"
      data-task="${t.id}" data-ms="${t.milestone}">
      <span class="task-drag">⠿</span>
      <span class="task-title" contenteditable="true" data-task="${t.id}">${escHtml(t.title)}</span>
      <button class="btn btn-xs task-toggle" data-task="${t.id}"
        data-next="${done ? 'open' : 'done'}">${done ? '↩' : '✓'}</button>
      <button class="btn btn-xs task-del" data-task="${t.id}">✕</button>
    </div>`;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Bind all events ───────────────────────────────────────────────────────────
function bindAll() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Category toggles
  $$('.cat-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      hiddenCats.has(cat) ? hiddenCats.delete(cat) : hiddenCats.add(cat);
      render();
    });
  });

  // Add project form
  $('#rm-add-project-btn')?.addEventListener('click', () => {
    const f = $('#rm-add-project-form');
    f.style.display = f.style.display === 'none' ? 'flex' : 'none';
  });
  $('#rm-proj-cancel')?.addEventListener('click', () => {
    $('#rm-add-project-form').style.display = 'none';
  });
  $('#rm-proj-save')?.addEventListener('click', async () => {
    const name = $('#rm-proj-name').value.trim();
    const category = $('#rm-proj-cat').value;
    if (!name) return;
    const proj = await api('/api/roadmaps/projects', 'POST', {
      name, category, order: state.projects.length,
    });
    state.projects.push(proj);
    $('#rm-add-project-form').style.display = 'none';
    render();
  });

  // Collapse
  $$('.rm-collapse').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const proj = state.projects.find((p) => p.slug === btn.dataset.proj);
      if (!proj) return;
      proj.collapsed = true;
      await api(`/api/roadmaps/projects/${proj.id}`, 'PATCH', { collapsed: true });
      render();
    });
  });
  $$('.roadmap-panel.collapsed').forEach((panel) => {
    panel.addEventListener('click', async () => {
      const proj = state.projects.find((p) => p.slug === panel.dataset.proj);
      if (!proj) return;
      proj.collapsed = false;
      await api(`/api/roadmaps/projects/${proj.id}`, 'PATCH', { collapsed: false });
      render();
    });
  });

  // Show milestone form
  $$('.rm-show-ms-form').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = $(`.rm-ms-form[data-proj="${btn.dataset.proj}"]`);
      if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
  });
  $$('.rm-ms-save').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const projSlug = btn.dataset.proj;
      const form = btn.closest('.rm-ms-form');
      const name = form.querySelector('.rm-ms-name').value.trim();
      if (!name) return;
      const order = state.milestones.filter((m) => m.project === projSlug).length;
      const ms = await api('/api/roadmaps/milestones', 'POST', { project: projSlug, name, order });
      state.milestones.push(ms);
      render();
    });
  });

  // Delete milestone
  $$('.rm-del-ms').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ms = state.milestones.find((m) => m.slug === btn.dataset.ms);
      if (!ms || !confirm(`Milestone "${ms.name}" löschen?`)) return;
      await api(`/api/roadmaps/milestones/${ms.id}`, 'DELETE');
      state.milestones = state.milestones.filter((m) => m.slug !== ms.slug);
      state.tasks = state.tasks.filter((t) => t.milestone !== ms.slug);
      render();
    });
  });

  // Set NOW
  $$('.rm-set-now').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const proj = state.projects.find((p) => p.slug === btn.dataset.proj);
      if (!proj) return;
      const newNow = proj.currentMilestone === btn.dataset.ms ? '' : btn.dataset.ms;
      proj.currentMilestone = newNow;
      await api(`/api/roadmaps/projects/${proj.id}`, 'PATCH', { currentMilestone: newNow });
      render();
    });
  });

  // Milestone name inline edit
  $$('.ms-name[contenteditable]').forEach((span) => {
    span.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } });
    span.addEventListener('blur', async () => {
      const ms = state.milestones.find((m) => m.slug === span.dataset.ms);
      if (!ms) return;
      const name = span.textContent.trim();
      if (name === ms.name) return;
      ms.name = name;
      await api(`/api/roadmaps/milestones/${ms.id}`, 'PATCH', { name });
    });
  });

  // Show task form
  $$('.rm-show-task-form').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.nextElementSibling;
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      form.querySelector('.rm-task-input')?.focus();
    });
  });
  $$('.rm-task-save').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const msSlug = btn.dataset.ms;
      const input = btn.previousElementSibling;
      const title = input.value.trim();
      if (!title) return;
      const task = await api('/api/roadmaps/tasks', 'POST', { milestone: msSlug, title });
      state.tasks.unshift(task);
      input.value = '';
      render();
    });
  });

  // Task done toggle
  $$('.task-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const task = state.tasks.find((t) => t.id === btn.dataset.task);
      if (!task) return;
      task.status = btn.dataset.next;
      await api(`/api/roadmaps/tasks/${task.id}`, 'PATCH', { status: task.status });
      render();
    });
  });

  // Task delete
  $$('.task-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/roadmaps/tasks/${btn.dataset.task}`, 'DELETE');
      state.tasks = state.tasks.filter((t) => t.id !== btn.dataset.task);
      render();
    });
  });

  // Task inline edit
  $$('.task-title[contenteditable]').forEach((span) => {
    span.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } });
    span.addEventListener('blur', async () => {
      const task = state.tasks.find((t) => t.id === span.dataset.task);
      if (!task) return;
      const title = span.textContent.trim();
      if (title === task.title) return;
      task.title = title;
      await api(`/api/roadmaps/tasks/${task.id}`, 'PATCH', { title });
    });
  });

  // Drag & drop
  $$('.task-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragTask = { id: card.dataset.task, sourceMilestone: card.dataset.ms };
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  $$('.drop-zone').forEach((zone) => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (!dragTask || !zone.dataset.ms || zone.dataset.ms === dragTask.sourceMilestone) return;
      const task = state.tasks.find((t) => t.id === dragTask.id);
      if (!task) return;
      task.milestone = zone.dataset.ms;
      await api(`/api/roadmaps/tasks/${task.id}`, 'PATCH', { milestone: zone.dataset.ms });
      dragTask = null;
      render();
    });
  });
}

// ── Lifecycle exports (main.js pattern) ──────────────────────────────────────
export async function initRoadmaps() {
  if (initialized) return;
  initialized = true;
  const root = document.getElementById('tool-roadmaps');
  if (!root) return;
  root.innerHTML = '<div class="tool-body" style="color:var(--ink-soft)">Lade…</div>';
  try {
    state = await api('/api/roadmaps');
    render();
  } catch (e) {
    root.innerHTML = `<div class="tool-body" style="color:var(--red)">Fehler: ${e.message}</div>`;
  }
}

export function activateRoadmaps() {
  if (!initialized) initRoadmaps();
}

export function deactivateRoadmaps() {}
