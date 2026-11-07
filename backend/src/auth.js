const crypto = require('crypto');
const db = require('./db');

const LOGIN_TTL = '+7 days';
const AGENT_RUN_TTL = '+15 minutes';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Tokens are random and only their hash is stored, so a leaked database can't be replayed.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

function bearerToken(req) {
  const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
  return match ? match[1] : null;
}

function issueLoginToken(userId) {
  const { token, tokenHash } = newToken();
  db.prepare("DELETE FROM auth_tokens WHERE expires_at <= datetime('now')").run();
  db.prepare(`INSERT INTO auth_tokens (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '${LOGIN_TTL}'))`)
    .run(tokenHash, userId);
  return token;
}

function revokeLoginToken(req) {
  const token = bearerToken(req);
  if (token) db.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').run(hashToken(token));
}

function issueAgentRun(userId, projectId, roleId) {
  const { token, tokenHash } = newToken();
  db.prepare("DELETE FROM agent_runs WHERE expires_at <= datetime('now')").run();
  const run = db.prepare(`
    INSERT INTO agent_runs (token_hash, user_id, project_id, role_id, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '${AGENT_RUN_TTL}'))
    RETURNING expires_at
  `).get(tokenHash, userId, projectId, roleId);
  return { token, expires_at: run.expires_at };
}

function requireAuth(req, res, next) {
  const token = bearerToken(req);
  const user = token && db.prepare(`
    SELECT u.id, u.username, u.account_type
    FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.expires_at > datetime('now')
  `).get(hashToken(token));
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  next();
}

const requireAccountType = (accountType, error) => [requireAuth, (req, res, next) => {
  if (req.user.account_type !== accountType) return res.status(403).json({ error });
  next();
}];

const requireMaintainer = requireAccountType('maintainer', 'Only maintainers can do this');
const requireDeveloper = requireAccountType('developer', 'Only developers can do this');

// Used by the local agent: the token identifies the user, project and role for one run.
function requireAgentRun(req, res, next) {
  const token = bearerToken(req);
  const run = token && db.prepare(`
    SELECT * FROM agent_runs
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')
  `).get(hashToken(token));
  if (!run) return res.status(401).json({ error: 'Agent token is invalid, expired or already used' });
  req.agentRun = run;
  next();
}

module.exports = {
  hashPassword, verifyPassword, issueLoginToken, revokeLoginToken, issueAgentRun,
  requireAuth, requireMaintainer, requireDeveloper, requireAgentRun
};
