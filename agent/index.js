const { runRequirement } = require('./check-runner');
const apiBase = process.env.API_BASE_URL || 'http://localhost:3001/api';

async function request(path, token, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

async function main() {
  // The token comes from the web UI after choosing a project and role. It is single-use and short-lived.
  const token = process.argv[2] || process.env.AGENT_TOKEN;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    console.error('Usage: node index.js <AGENT_TOKEN>  (or set AGENT_TOKEN)');
    console.error('Get a token from the web UI: choose your project and role, then "Generate agent command".');
    process.exitCode = 1;
    return;
  }

  const { project, role, requirements } = await request('/agent/run', token);
  console.log(`Verifying ${project.name} as ${role.name}.`);
  if (!requirements.length) return console.log('No requirements configured for this project and role.');

  const results = [];
  for (const requirement of requirements) {
    process.stdout.write(`Checking ${requirement.name}... `);
    const result = await runRequirement(requirement);
    results.push(result);
    console.log(result.status);
  }

  const session = await request('/agent/sessions', token, { method: 'POST', body: JSON.stringify({ results }) });
  console.log(`Verification complete (session ${session.id}). Refresh the web UI to see your results.`);
}

main().catch((error) => {
  console.error('Agent failed:', error.message);
  process.exitCode = 1;
});
