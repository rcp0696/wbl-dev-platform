// Creates a maintainer account, or promotes an existing account to maintainer.
// Usage: npm run create-maintainer -- <username> <password>
const db = require('./db');
const { hashPassword } = require('./auth');

const [rawUsername, password] = process.argv.slice(2);
const username = (rawUsername || '').trim();
if (!username || username.length > 64 || !password || password.length < 8) {
  console.error('Usage: npm run create-maintainer -- <username> <password>  (password at least 8 characters)');
  process.exit(1);
}

const existing = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (existing) {
  db.prepare("UPDATE users SET account_type = 'maintainer', password_hash = ? WHERE id = ?").run(hashPassword(password), existing.id);
  console.log(`Promoted ${existing.username} to maintainer and reset their password.`);
} else {
  db.prepare("INSERT INTO users (username, password_hash, account_type) VALUES (?, ?, 'maintainer')").run(username, hashPassword(password));
  console.log(`Created maintainer ${username}.`);
}
