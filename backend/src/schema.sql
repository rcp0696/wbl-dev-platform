PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'developer' CHECK (account_type IN ('maintainer', 'developer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Login tokens. Only a SHA-256 hash of each token is stored.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

-- Roles someone can onboard as within a project, e.g. Developer or Tester.
CREATE TABLE IF NOT EXISTS project_roles (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  command TEXT,
  args TEXT NOT NULL DEFAULT '[]',
  operator TEXT,
  expected_value TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'mandatory',
  remediation TEXT NOT NULL DEFAULT ''
);

-- A requirement with no rows here applies to every role in its project.
CREATE TABLE IF NOT EXISTS requirement_roles (
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES project_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (requirement_id, role_id)
);

-- Short-lived, single-use token the agent uses for one verification run.
CREATE TABLE IF NOT EXISTS agent_runs (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES project_roles(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES project_roles(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  detected_value TEXT,
  message TEXT NOT NULL DEFAULT ''
);
