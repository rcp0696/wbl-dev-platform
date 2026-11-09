# Developer Onboarding & Environment Verification Platform

MVP for WBL II.

## Stack

- React frontend (Vite)
- Node.js + Express backend (CommonJS)
- SQLite (Node's built-in `node:sqlite`, stored in `backend/onboarding.db`)
- Node.js local verification agent (CommonJS)

## Run it

1. Backend (creates the database automatically):
   `cd backend && npm install && npm run dev`
2. Create the first maintainer (one-off):
   `cd backend && npm run create-maintainer -- <username> <password>`
3. Frontend:
   `cd frontend && npm install && npm run dev`
4. Agent: log in as a developer, pick a project and role, click **Generate agent command**, then run it:
   `cd agent && node index.js <AGENT_TOKEN>`

The backend uses Node's built-in `node:sqlite` module. The agent uses the built-in `fetch`.

## Accounts and roles

There are two kinds of account, and separately, each project has its own roles.

|                      | Can do                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maintainer** | Create projects, define project roles, add/delete requirements (optionally per role), promote or demote users, see every developer's latest results |
| **Developer**  | Log in, choose a project and role, generate an agent command, see their own results                                                                 |

- Accounts use a username (anything up to 64 characters, matched case-insensitively) and a password of at least 8 characters.
- Anyone can self-register, but only as a developer. A maintainer can promote them from the Users panel; `npm run create-maintainer` creates or promotes an account from the command line.
- Project roles (e.g. Developer, Tester, DevOps) are defined per project by maintainers. A requirement can be tied to one or more roles; a requirement with no roles applies to everyone on that project.
- The agent never sees a password. The web UI issues a single-use token (valid for 15 minutes) tied to one user, project and role, and the backend only returns and accepts results for that role's requirements.
- Passwords are hashed with scrypt; login and agent tokens are random and only their SHA-256 hash is stored. Login tokens last 7 days.
- Existing databases are upgraded in place on startup. Sessions recorded before auth have no owner and are not shown. Projects created before roles existed have none, so a maintainer must add at least one role before developers can run the agent.

## Supported check types

- `tool_version`: directly invokes an executable with `execFile()` and compares the detected version.
- `env_var`: verifies that a variable exists but never sends its value.
- `file`: checks whether a path exists relative to the directory in which the agent is run.

## Good demo data

Log in as a maintainer, create a project with the roles `Developer` and `Tester`, and add:

- Node.js >= 18, command `node`, args `--version` (all roles)
- Git >= 2, command `git`, args `--version` (Developer only)
- An environment variable such as `HOME` / `USERPROFILE` (Tester only)
- An existing file such as `./package.json`
- One deliberately failing requirement

Register a developer account, choose the project and the `Tester` role, generate and run the agent command, and refresh the web UI to show PASS/FAIL results and remediation guidance. Repeating it as `Developer` checks a different set of requirements.
