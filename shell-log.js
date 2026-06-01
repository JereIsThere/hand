// ShellLog — strukturiertes Command-Logging für die AI-Shell.
// OrientDB-Klasse ShellLog mit Index auf mainCmd + subCmd.
// API: POST /api/shell/log  (Admin-only)
//      GET  /api/shell/log  (Admin-only, Query-Filter)

const sqlStr = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''")}'`;
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

export function setupShellLog(app, { odb, dbName, requireAdmin }) {
  const sql = (cmd) => odb(`/command/${dbName}/sql`, {
    method: 'POST', body: cmd, headers: { 'Content-Type': 'text/plain' },
  });

  async function ensureSchema() {
    for (const s of [
      'CREATE CLASS ShellLog IF NOT EXISTS',
      'CREATE PROPERTY ShellLog.mainCmd    IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.subCmd     IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.fullCmd    IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.risk       IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.summary    IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.suggestion IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.exitCode   IF NOT EXISTS INTEGER',
      'CREATE PROPERTY ShellLog.durationMs IF NOT EXISTS INTEGER',
      'CREATE PROPERTY ShellLog.cwd        IF NOT EXISTS STRING',
      'CREATE PROPERTY ShellLog.ts         IF NOT EXISTS DATETIME',
      // Indizes für Dashboard-Queries
      'CREATE INDEX ShellLog.mainCmd IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX ShellLog.subCmd  IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX ShellLog.risk    IF NOT EXISTS NOTUNIQUE',
      'CREATE INDEX ShellLog.ts      IF NOT EXISTS NOTUNIQUE',
    ]) await sql(s);
  }

  // POST /api/shell/log — vom shell-ai.mjs aufgerufen
  app.post('/api/shell/log', requireAdmin(), async (req, res) => {
    try {
      const {
        mainCmd, subCmd, fullCmd, risk, summary, suggestion,
        exitCode, durationMs, cwd,
      } = req.body || {};
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
      await sql(
        `INSERT INTO ShellLog SET ` +
        `mainCmd = ${sqlStr(mainCmd)}, subCmd = ${sqlStr(subCmd)}, ` +
        `fullCmd = ${sqlStr(fullCmd)}, risk = ${sqlStr(risk)}, ` +
        `summary = ${sqlStr(summary)}, suggestion = ${sqlStr(suggestion)}, ` +
        `exitCode = ${exitCode ?? 0}, durationMs = ${durationMs ?? 0}, ` +
        `cwd = ${sqlStr(cwd)}, ts = ${sqlStr(ts)}`
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/shell/log — Dashboard-Queries
  // ?mainCmd=git  ?risk=high  ?limit=50  ?stats=1
  app.get('/api/shell/log', requireAdmin(), async (req, res) => {
    try {
      if (req.query.stats === '1') {
        // Top-Commands + Risk-Verteilung
        const [cmds, risks] = await Promise.all([
          sql(`SELECT mainCmd, count(*) AS n FROM ShellLog GROUP BY mainCmd ORDER BY n DESC LIMIT 20`),
          sql(`SELECT risk, count(*) AS n FROM ShellLog GROUP BY risk ORDER BY n DESC`),
        ]);
        return res.json({ topCommands: cmds.result, riskBreakdown: risks.result });
      }
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const filters = [];
      if (req.query.mainCmd) filters.push(`mainCmd = ${sqlStr(req.query.mainCmd)}`);
      if (req.query.risk)    filters.push(`risk = ${sqlStr(req.query.risk)}`);
      const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
      const r = await sql(`SELECT @rid, * FROM ShellLog${where} ORDER BY ts DESC LIMIT ${limit}`);
      res.json({ rows: r.result || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { ensureSchema };
}
