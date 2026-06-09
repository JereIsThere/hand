// roadmaps.js — Roadmap-Cockpit Backend für Die Hand.
// Zwei Quellen: OrientDB (extern) + GitHub roadmap.REPO.md (auge-framework).

// ── GitHub-backed Roadmaps ────────────────────────────────────────────────────

const REPOS = [
  { id: 'auge',    owner: 'JereIsThere', repo: 'auge',    file: 'roadmap.auge.md'    },
  { id: 'hand',    owner: 'JereIsThere', repo: 'hand',    file: 'roadmap.hand.md'    },
  { id: 'gehirn',  owner: 'JereIsThere', repo: 'gehirn',  file: 'roadmap.gehirn.md'  },
  { id: 'funkner', owner: 'JereIsThere', repo: 'funkner', file: 'roadmap.funkner.md' },
];

const PROJECT_COLORS = {
  auge: '#00d4c8', hand: '#d4a200', gehirn: '#a855f7', funkner: '#22c55e',
};

async function ghGet(path, token) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  return res.json();
}

async function ghPut(path, body, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub PUT ${res.status}`);
  }
  return res.json();
}

function parseRoadmap(md, repoId) {
  const lines = md.split('\n');

  // <!-- NOW: MX -->
  const nowMatch = md.match(/<!--\s*NOW:\s*(M\w+)\s*-->/);
  const nowSlug = nowMatch?.[1] || null;

  const milestones = [];
  const tasks = [];
  let currentMs = null;
  let msIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## M1: Name  or  ## Backlog
    const msMatch = line.match(/^##\s+(M\w+|Backlog)(?::\s*(.+))?$/);
    if (msMatch) {
      const msId = `${repoId}-${msMatch[1].toLowerCase()}`;
      const name = msMatch[2]?.trim() || msMatch[1];
      currentMs = { id: msId, repoId, slug: msMatch[1], name, description: null, order: msIndex++, isNow: msMatch[1] === nowSlug };
      milestones.push(currentMs);
      continue;
    }

    // > description line directly after ## header
    const descMatch = line.match(/^>\s*(.+)$/);
    if (descMatch && currentMs && currentMs.description === null) {
      currentMs.description = descMatch[1].trim();
      continue;
    }

    // - [x] or - [ ]
    const taskMatch = line.match(/^- \[([ x])\] (.+)$/);
    if (taskMatch && currentMs) {
      tasks.push({
        id: `${repoId}-task-${tasks.length}`,
        repoId,
        milestoneId: currentMs.id,
        milestoneSlug: currentMs.slug,
        index: tasks.filter(t => t.repoId === repoId).length,
        title: taskMatch[2].trim(),
        status: taskMatch[1] === 'x' ? 'done' : 'open',
      });
    }
  }

  return { milestones, tasks, nowSlug };
}

async function fetchGithubRoadmaps(token) {
  const results = await Promise.allSettled(
    REPOS.map(async ({ id, owner, repo, file }) => {
      const data = await ghGet(`/repos/${owner}/${repo}/contents/${file}`, token);
      const md = Buffer.from(data.content, 'base64').toString('utf8');
      const { milestones, tasks } = parseRoadmap(md, id);

      // Classify milestones
      const msTaskMap = {};
      for (const m of milestones) msTaskMap[m.id] = [];
      for (const t of tasks) msTaskMap[t.milestoneId]?.push(t);

      const future  = milestones.filter(m => !m.isNow && msTaskMap[m.id].some(t => t.status === 'open'));
      const current = milestones.filter(m => m.isNow);
      const done    = milestones.filter(m => !m.isNow && msTaskMap[m.id].length > 0 && msTaskMap[m.id].every(t => t.status === 'done'));
      // Milestones with no tasks: treat as future
      const noTasks = milestones.filter(m => !m.isNow && msTaskMap[m.id].length === 0);

      const sorted = [...[...future, ...noTasks].reverse(), ...current, ...done];

      return {
        project: {
          id, slug: id, name: id, category: 'auge-framework',
          color: PROJECT_COLORS[id] || '#00d4c8',
          currentMilestone: current[0]?.id || null,
          sha: data.sha,
          rawUrl: data.download_url,
        },
        milestones: sorted,
        tasks,
      };
    })
  );

  const projects = [], milestones = [], tasks = [], errors = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      projects.push(r.value.project);
      milestones.push(...r.value.milestones);
      tasks.push(...r.value.tasks);
    } else {
      const id = REPOS[i].id;
      console.warn(`[roadmaps] ${id}: ${r.reason?.message || r.reason}`);
      errors.push({ repo: id, error: r.reason?.message || String(r.reason) });
    }
  }
  return { projects, milestones, tasks, errors };
}

async function toggleTask(repoId, taskIndex, token) {
  const { owner, repo, file } = REPOS.find(r => r.id === repoId) || {};
  if (!owner) throw new Error(`Unknown repo: ${repoId}`);

  // Fetch current file
  const data = await ghGet(`/repos/${owner}/${repo}/contents/${file}`, token);
  const md = Buffer.from(data.content, 'base64').toString('utf8');
  const lines = md.split('\n');

  // Find the nth task line (counting only task lines)
  let count = -1;
  let targetLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^- \[([ x])\] /.test(lines[i])) {
      count++;
      if (count === taskIndex) { targetLine = i; break; }
    }
  }
  if (targetLine === -1) throw new Error(`Task index ${taskIndex} not found`);

  // Toggle
  const was = lines[targetLine].includes('- [x]');
  lines[targetLine] = lines[targetLine].replace(
    was ? '- [x] ' : '- [ ] ',
    was ? '- [ ] ' : '- [x] '
  );

  const newContent = Buffer.from(lines.join('\n')).toString('base64');
  await ghPut(`/repos/${owner}/${repo}/contents/${file}`, {
    message: 'roadmap: update via hand',
    content: newContent,
    sha: data.sha,
  }, token);
}

// ── OrientDB helpers ──────────────────────────────────────────────────────────

const sqlStr = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''").slice(0, 8000)}'`;
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
const slug   = () => Math.random().toString(36).slice(2, 10);

export function setupRoadmaps(app, { odb, dbName }) {
  const sql = (cmd) => odb(`/command/${dbName}/sql`, {
    method: 'POST', body: cmd, headers: { 'Content-Type': 'text/plain' },
  });

  // ── Schema ────────────────────────────────────────────────────────────
  async function ensureSchema() {
    for (const s of [
      // Project
      'CREATE CLASS RoadmapProject IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY RoadmapProject.slug              IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapProject.name              IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapProject.category          IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapProject.color             IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapProject.order             IF NOT EXISTS INTEGER',
      'CREATE PROPERTY RoadmapProject.collapsed         IF NOT EXISTS BOOLEAN',
      'CREATE PROPERTY RoadmapProject.currentMilestone  IF NOT EXISTS STRING',
      'CREATE INDEX RoadmapProject.slug IF NOT EXISTS UNIQUE',
      // Milestone
      'CREATE CLASS RoadmapMilestone IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY RoadmapMilestone.slug     IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapMilestone.project  IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapMilestone.name     IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapMilestone.order    IF NOT EXISTS INTEGER',
      'CREATE INDEX RoadmapMilestone.slug IF NOT EXISTS UNIQUE',
      // Task
      'CREATE CLASS RoadmapTask IF NOT EXISTS EXTENDS V',
      'CREATE PROPERTY RoadmapTask.slug        IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapTask.milestone   IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapTask.title       IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapTask.status      IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapTask.createdAt   IF NOT EXISTS STRING',
      'CREATE PROPERTY RoadmapTask.description IF NOT EXISTS STRING',
      'CREATE INDEX RoadmapTask.slug IF NOT EXISTS UNIQUE',
    ]) await sql(s).catch(() => {});
  }

  ensureSchema();

  // ── Helpers ───────────────────────────────────────────────────────────
  const getAll = async () => {
    const [pr, mr, tr] = await Promise.all([
      sql('SELECT @rid.asString() AS id, slug, name, category, color, order, collapsed, currentMilestone FROM RoadmapProject ORDER BY order ASC'),
      sql('SELECT @rid.asString() AS id, slug, project, name, order FROM RoadmapMilestone ORDER BY order ASC'),
      sql('SELECT @rid.asString() AS id, slug, milestone, title, status, createdAt, description FROM RoadmapTask ORDER BY createdAt DESC'),
    ]);
    return {
      projects:   pr.result  || [],
      milestones: mr.result  || [],
      tasks:      tr.result  || [],
    };
  };

  // ── Routes ────────────────────────────────────────────────────────────

  app.get('/api/roadmaps', async (_req, res) => {
    try { res.json(await getAll()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Projects
  app.post('/api/roadmaps/projects', async (req, res) => {
    try {
      const { name, category = 'extern', color = '#00d4c8', order = 0 } = req.body;
      const s = slug();
      await sql(`INSERT INTO RoadmapProject SET slug=${sqlStr(s)}, name=${sqlStr(name)}, category=${sqlStr(category)}, color=${sqlStr(color)}, order=${Number(order)}, collapsed=false`);
      const r = await sql(`SELECT @rid.asString() AS id, slug, name, category, color, order, collapsed, currentMilestone FROM RoadmapProject WHERE slug=${sqlStr(s)} LIMIT 1`);
      res.json(r.result?.[0] || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/roadmaps/projects/:id', async (req, res) => {
    try {
      const id = safeId(req.params.id);
      const allowed = ['collapsed','currentMilestone','order','category','name','color'];
      const sets = Object.entries(req.body)
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => typeof v === 'boolean' ? `${k}=${v}` : typeof v === 'number' ? `${k}=${v}` : `${k}=${sqlStr(v)}`)
        .join(', ');
      if (!sets) return res.json({});
      await sql(`UPDATE RoadmapProject SET ${sets} WHERE @rid=${id}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Milestones
  app.post('/api/roadmaps/milestones', async (req, res) => {
    try {
      const { project, name, order = 0 } = req.body;
      const s = slug();
      await sql(`INSERT INTO RoadmapMilestone SET slug=${sqlStr(s)}, project=${sqlStr(project)}, name=${sqlStr(name)}, order=${Number(order)}`);
      const r = await sql(`SELECT @rid.asString() AS id, slug, project, name, order FROM RoadmapMilestone WHERE slug=${sqlStr(s)} LIMIT 1`);
      res.json(r.result?.[0] || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/roadmaps/milestones/:id', async (req, res) => {
    try {
      const id = safeId(req.params.id);
      const { name, order } = req.body;
      const sets = [
        name  != null ? `name=${sqlStr(name)}`    : null,
        order != null ? `order=${Number(order)}`  : null,
      ].filter(Boolean).join(', ');
      if (!sets) return res.json({});
      await sql(`UPDATE RoadmapMilestone SET ${sets} WHERE @rid=${id}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/roadmaps/milestones/:id', async (req, res) => {
    try {
      const id = safeId(req.params.id);
      await sql(`DELETE VERTEX RoadmapMilestone WHERE @rid=${id}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Tasks
  app.post('/api/roadmaps/tasks', async (req, res) => {
    try {
      const { milestone, title, description = '' } = req.body;
      const s = slug();
      const createdAt = new Date().toISOString();
      await sql(`INSERT INTO RoadmapTask SET slug=${sqlStr(s)}, milestone=${sqlStr(milestone)}, title=${sqlStr(title)}, status='open', createdAt=${sqlStr(createdAt)}, description=${sqlStr(description)}`);
      const r = await sql(`SELECT @rid.asString() AS id, slug, milestone, title, status, createdAt, description FROM RoadmapTask WHERE slug=${sqlStr(s)} LIMIT 1`);
      res.json(r.result?.[0] || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/roadmaps/tasks/:id', async (req, res) => {
    try {
      const id = safeId(req.params.id);
      const allowed = ['title','status','milestone','description'];
      const sets = Object.entries(req.body)
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => `${k}=${sqlStr(v)}`)
        .join(', ');
      if (!sets) return res.json({});
      await sql(`UPDATE RoadmapTask SET ${sets} WHERE @rid=${id}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/roadmaps/tasks/:id', async (req, res) => {
    try {
      const id = safeId(req.params.id);
      await sql(`DELETE VERTEX RoadmapTask WHERE @rid=${id}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GitHub-backed Routes ──────────────────────────────────────────────

  app.get('/api/roadmaps/github', async (_req, res) => {
    try {
      const token = process.env.GITHUB_TOKEN;
      res.json(await fetchGithubRoadmaps(token));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/roadmaps/github/:repoId/tasks/:taskIndex', async (req, res) => {
    try {
      const token = process.env.GITHUB_TOKEN;
      await toggleTask(req.params.repoId, parseInt(req.params.taskIndex, 10), token);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
