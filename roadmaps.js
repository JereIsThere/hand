// roadmaps.js — Roadmap-Cockpit Backend für Die Hand.
// Projekte → Milestones → Tasks, alles in OrientDB.

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
}
