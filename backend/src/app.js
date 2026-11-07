const express = require('express');
const db = require('./db');
const {
  hashPassword, verifyPassword, issueLoginToken, revokeLoginToken, issueAgentRun,
  requireAuth, requireMaintainer, requireDeveloper, requireAgentRun
} = require('./auth');

const app = express();
const port = process.env.PORT || 3001;
app.use(express.json({ limit: '100kb' }));
// Express 5 leaves req.body undefined when no JSON body is sent.
app.use((req, res, next) => { req.body ??= {}; next(); });

const TYPES = ['tool_version', 'env_var', 'file'];
const SEVERITIES = ['mandatory', 'recommended'];
const OPERATORS = ['=', '>=', '>', '<=', '<'];
const RESULT_STATUSES = ['PASS', 'FAIL', 'ERROR'];
const ACCOUNT_TYPES = ['maintainer', 'developer'];

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

app.param('projectId', (req, res, next, value) => {
  req.projectId = positiveInt(value);
  if (!req.projectId) return res.status(400).json({ error: 'Invalid project ID' });
  next();
});

function validateCredentials(body) {
  if (typeof body.username !== 'string' || !body.username.trim()) return 'Username is required';
  if (body.username.trim().length > 64) return 'Username must be 64 characters or fewer';
  if (typeof body.password !== 'string' || body.password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

function validateRequirement(body) {
  if (!body.name || typeof body.name !== 'string') return 'name is required';
  if (!TYPES.includes(body.type)) return 'unsupported type';
  if (!body.expected_value || typeof body.expected_value !== 'string') return 'expected_value is required';
  if (body.severity && !SEVERITIES.includes(body.severity)) return 'invalid severity';
  if (body.role_ids && !Array.isArray(body.role_ids)) return 'role_ids must be an array';
  if (body.type === 'tool_version') {
    if (!body.command || typeof body.command !== 'string') return 'command is required for tool_version';
    if (body.args && !Array.isArray(body.args)) return 'args must be an array';
    if (body.operator && !OPERATORS.includes(body.operator)) return 'invalid operator';
  }
  return null;
}

function projectExists(id) {
  return Boolean(db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id));
}

function projectRole(projectId, roleId) {
  return db.prepare('SELECT * FROM project_roles WHERE id = ? AND project_id = ?').get(roleId, projectId);
}

const withArgs = (row) => ({ ...row, args: JSON.parse(row.args) });
const publicUser = ({ id, username, account_type }) => ({ id, username, account_type });

// Usernames are shown as typed but matched case-insensitively.
const findUser = (username) => db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());

// Requirements with no role assigned apply to every role in the project.
function requirementsForRole(projectId, roleId) {
  return db.prepare(`
    SELECT r.* FROM requirements r
    WHERE r.project_id = ?
      AND (NOT EXISTS (SELECT 1 FROM requirement_roles rr WHERE rr.requirement_id = r.id)
           OR EXISTS (SELECT 1 FROM requirement_roles rr WHERE rr.requirement_id = r.id AND rr.role_id = ?))
    ORDER BY r.id
  `).all(projectId, roleId).map(withArgs);
}

function sessionResults(sessionId) {
  return db.prepare(`
    SELECT cr.*, r.name AS requirement_name, r.severity, r.remediation
    FROM check_results cr
    JOIN requirements r ON r.id = cr.requirement_id
    WHERE cr.session_id = ?
    ORDER BY cr.id
  `).all(sessionId);
}

app.get('/api/health', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ status: 'ok' });
});

// --- Auth ---

// Self-registration always creates a developer; maintainers are seeded or promoted.
app.post('/api/auth/register', (req, res) => {
  const validationError = validateCredentials(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const username = req.body.username.trim();
  if (findUser(username)) return res.status(409).json({ error: 'That username is already taken' });
  const user = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING *')
    .get(username, hashPassword(req.body.password));
  res.status(201).json({ token: issueLoginToken(user.id), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = typeof username === 'string' && findUser(username);
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  res.json({ token: issueLoginToken(user.id), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.post('/api/auth/logout', requireAuth, (req, res) => {
  revokeLoginToken(req);
  res.status(204).end();
});

// --- Users (maintainers only) ---

app.get('/api/users', requireMaintainer, (req, res) => {
  res.json(db.prepare('SELECT id, username, account_type, created_at FROM users ORDER BY id').all());
});

app.patch('/api/users/:userId', requireMaintainer, (req, res) => {
  const userId = positiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user ID' });
  if (!ACCOUNT_TYPES.includes(req.body.account_type)) return res.status(400).json({ error: 'invalid account_type' });
  if (userId === req.user.id) return res.status(400).json({ error: 'You cannot change your own account type' });
  const user = db.prepare('UPDATE users SET account_type = ? WHERE id = ? RETURNING *').get(req.body.account_type, userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

// --- Projects and roles ---

app.get('/api/projects', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id) AS requirement_count,
      (SELECT COUNT(*) FROM project_roles pr WHERE pr.project_id = p.id) AS role_count
    FROM projects p
    ORDER BY p.id DESC
  `).all());
});

app.post('/api/projects', requireMaintainer, (req, res) => {
  const { name, description = '' } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Project name is required' });
  const project = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?) RETURNING *')
    .get(String(name).trim(), String(description).trim());
  res.status(201).json(project);
});

app.get('/api/projects/:projectId/roles', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM project_roles WHERE project_id = ? ORDER BY name').all(req.projectId));
});

app.post('/api/projects/:projectId/roles', requireMaintainer, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Role name is required' });
  if (!projectExists(req.projectId)) return res.status(404).json({ error: 'Project not found' });
  if (db.prepare('SELECT 1 FROM project_roles WHERE project_id = ? AND name = ?').get(req.projectId, name)) {
    return res.status(409).json({ error: 'That role already exists on this project' });
  }
  const role = db.prepare('INSERT INTO project_roles (project_id, name) VALUES (?, ?) RETURNING *').get(req.projectId, name);
  res.status(201).json(role);
});

app.delete('/api/roles/:roleId', requireMaintainer, (req, res) => {
  const roleId = positiveInt(req.params.roleId);
  if (!roleId) return res.status(400).json({ error: 'Invalid role ID' });
  const { changes } = db.prepare('DELETE FROM project_roles WHERE id = ?').run(roleId);
  if (!changes) return res.status(404).json({ error: 'Role not found' });
  res.status(204).end();
});

// --- Requirements (maintainers only) ---

app.get('/api/projects/:projectId/requirements', requireMaintainer, (req, res) => {
  const roleLinks = db.prepare(`
    SELECT rr.requirement_id, rr.role_id
    FROM requirement_roles rr
    JOIN requirements r ON r.id = rr.requirement_id
    WHERE r.project_id = ?
  `).all(req.projectId);
  res.json(db.prepare('SELECT * FROM requirements WHERE project_id = ? ORDER BY id').all(req.projectId).map((row) => ({
    ...withArgs(row),
    role_ids: roleLinks.filter((link) => link.requirement_id === row.id).map((link) => link.role_id)
  })));
});

app.post('/api/projects/:projectId/requirements', requireMaintainer, (req, res) => {
  const validationError = validateRequirement(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  if (!projectExists(req.projectId)) return res.status(404).json({ error: 'Project not found' });

  const {
    name, type, command = null, args = [], operator = null,
    expected_value, severity = 'mandatory', remediation = '', role_ids = []
  } = req.body;

  const roleIds = [...new Set(role_ids.map(positiveInt))];
  if (roleIds.some((roleId) => !roleId || !projectRole(req.projectId, roleId))) {
    return res.status(400).json({ error: 'Role does not belong to project' });
  }

  db.exec('BEGIN');
  try {
    const requirement = db.prepare(`
      INSERT INTO requirements
        (project_id, name, type, command, args, operator, expected_value, severity, remediation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(req.projectId, name.trim(), type, command ? String(command).trim() : null,
      JSON.stringify(args), operator, expected_value.trim(), severity, String(remediation).trim());
    const linkRole = db.prepare('INSERT INTO requirement_roles (requirement_id, role_id) VALUES (?, ?)');
    for (const roleId of roleIds) linkRole.run(requirement.id, roleId);
    db.exec('COMMIT');
    res.status(201).json({ ...withArgs(requirement), role_ids: roleIds });
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

app.delete('/api/requirements/:requirementId', requireMaintainer, (req, res) => {
  const requirementId = positiveInt(req.params.requirementId);
  if (!requirementId) return res.status(400).json({ error: 'Invalid requirement ID' });
  const { changes } = db.prepare('DELETE FROM requirements WHERE id = ?').run(requirementId);
  if (!changes) return res.status(404).json({ error: 'Requirement not found' });
  res.status(204).end();
});

// --- Agent runs ---

// A developer picks a project and role; the returned token is pasted into the local agent.
app.post('/api/projects/:projectId/runs', requireDeveloper, (req, res) => {
  const roleId = positiveInt(req.body.role_id);
  if (!roleId) return res.status(400).json({ error: 'role_id is required' });
  if (!projectExists(req.projectId)) return res.status(404).json({ error: 'Project not found' });
  if (!projectRole(req.projectId, roleId)) return res.status(400).json({ error: 'Role does not belong to project' });
  res.status(201).json(issueAgentRun(req.user.id, req.projectId, roleId));
});

app.get('/api/agent/run', requireAgentRun, (req, res) => {
  const { project_id, role_id } = req.agentRun;
  res.json({
    project: db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id),
    role: db.prepare('SELECT * FROM project_roles WHERE id = ?').get(role_id),
    requirements: requirementsForRole(project_id, role_id)
  });
});

// The agent submits a whole verification run in one request; this consumes the token.
app.post('/api/agent/sessions', requireAgentRun, (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || !results.length) return res.status(400).json({ error: 'results must be a non-empty array' });

  const run = req.agentRun;
  const roleRequirementIds = new Set(requirementsForRole(run.project_id, run.role_id).map((r) => r.id));
  for (const result of results) {
    if (!roleRequirementIds.has(positiveInt(result.requirement_id))) {
      return res.status(400).json({ error: 'Requirement does not apply to this project and role' });
    }
    if (!RESULT_STATUSES.includes(result.status)) return res.status(400).json({ error: 'Invalid result status' });
  }

  const insertResult = db.prepare(`
    INSERT INTO check_results (session_id, requirement_id, status, detected_value, message)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    const { changes } = db.prepare("UPDATE agent_runs SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL")
      .run(run.token_hash);
    if (!changes) {
      db.exec('ROLLBACK');
      return res.status(401).json({ error: 'Agent token has already been used' });
    }
    const session = db.prepare('INSERT INTO onboarding_sessions (project_id, user_id, role_id) VALUES (?, ?, ?) RETURNING *')
      .get(run.project_id, run.user_id, run.role_id);
    for (const result of results) {
      insertResult.run(session.id, Number(result.requirement_id), result.status,
        result.detected_value == null ? null : String(result.detected_value).slice(0, 500),
        String(result.message || '').slice(0, 1000));
    }
    db.exec('COMMIT');
    res.status(201).json(session);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

// --- Results ---

// The current user's latest run on a project, optionally for one role. Null (not 404) when there is none.
app.get('/api/projects/:projectId/my-latest-session', requireAuth, (req, res) => {
  const roleId = req.query.role_id ? positiveInt(req.query.role_id) : null;
  if (req.query.role_id && !roleId) return res.status(400).json({ error: 'Invalid role ID' });
  const session = db.prepare(`
    SELECT s.*, pr.name AS role_name
    FROM onboarding_sessions s
    LEFT JOIN project_roles pr ON pr.id = s.role_id
    WHERE s.project_id = ? AND s.user_id = ? AND (? IS NULL OR s.role_id = ?)
    ORDER BY s.id DESC LIMIT 1
  `).get(req.projectId, req.user.id, roleId, roleId);
  if (!session) return res.json(null);
  res.json({ ...session, results: sessionResults(session.id) });
});

// Maintainer overview: each user's latest run per role on this project.
app.get('/api/projects/:projectId/sessions', requireMaintainer, (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, u.username, pr.name AS role_name
    FROM onboarding_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN project_roles pr ON pr.id = s.role_id
    WHERE s.id IN (
      SELECT MAX(id) FROM onboarding_sessions
      WHERE project_id = ? AND user_id IS NOT NULL
      GROUP BY user_id, role_id
    )
    ORDER BY s.id DESC
  `).all(req.projectId);
  res.json(sessions.map((session) => ({ ...session, results: sessionResults(session.id) })));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
