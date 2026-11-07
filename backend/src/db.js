const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(process.env.DATABASE_PATH || path.join(__dirname, '..', 'onboarding.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Early auth builds logged in by email; existing accounts keep their email as their username.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (userColumns.includes('email')) db.exec('ALTER TABLE users RENAME COLUMN email TO username');

// Databases created before auth have sessions with no owner; add the columns in place.
const sessionColumns = db.prepare('PRAGMA table_info(onboarding_sessions)').all().map((c) => c.name);
if (!sessionColumns.includes('user_id')) {
  db.exec('ALTER TABLE onboarding_sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
}
if (!sessionColumns.includes('role_id')) {
  db.exec('ALTER TABLE onboarding_sessions ADD COLUMN role_id INTEGER REFERENCES project_roles(id) ON DELETE SET NULL');
}

module.exports = db;
