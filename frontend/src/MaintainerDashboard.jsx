import { useEffect, useMemo, useState } from 'react';
import {
  createProject, createRequirement, createRole, deleteRequirement, deleteRole,
  getProjectSessions, getProjects, getRequirements, getRoles, getUsers, setAccountType
} from './api';
import { useAuth } from './auth';
import SessionResults, { sessionSummary } from './SessionResults';

const emptyRequirement = { name: '', type: 'tool_version', command: '', argsText: '--version', operator: '>=', expectedValue: '', severity: 'mandatory', remediation: '', roleIds: [] };

export default function MaintainerDashboard({ onError }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [roles, setRoles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [users, setUsers] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [roleName, setRoleName] = useState('');
  const [form, setForm] = useState(emptyRequirement);

  const project = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);
  const roleNames = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r.name])), [roles]);

  // Wraps event handlers so failures show in the error banner.
  const guard = (fn) => (...args) => fn(...args).catch((e) => onError(e.message));

  async function loadProjects() {
    const data = await getProjects();
    setProjects(data);
    if (!selectedId && data.length) setSelectedId(data[0].id);
  }

  async function loadDetails(id) {
    if (!id) return;
    const [reqs, projectRoles, projectSessions] = await Promise.all([getRequirements(id), getRoles(id), getProjectSessions(id)]);
    setRequirements(reqs); setRoles(projectRoles); setSessions(projectSessions);
  }

  const loadUsers = async () => setUsers(await getUsers());

  useEffect(() => { guard(loadProjects)(); guard(loadUsers)(); }, []);
  useEffect(() => { setForm(emptyRequirement); setOpenSessionId(null); guard(loadDetails)(selectedId); }, [selectedId]);

  const addProject = guard(async (e) => {
    e.preventDefault();
    const created = await createProject({ name: projectName, description: projectDescription });
    setProjectName(''); setProjectDescription(''); await loadProjects(); setSelectedId(created.id);
  });

  const addRole = guard(async (e) => {
    e.preventDefault();
    await createRole(selectedId, { name: roleName });
    setRoleName(''); await loadDetails(selectedId); await loadProjects();
  });

  const removeRole = guard(async (role) => {
    if (!confirm(`Delete the ${role.name} role? Requirements only assigned to it will apply to every role.`)) return;
    await deleteRole(role.id);
    setForm((f) => ({ ...f, roleIds: f.roleIds.filter((id) => id !== role.id) }));
    await loadDetails(selectedId); await loadProjects();
  });

  const addRequirement = guard(async (e) => {
    e.preventDefault();
    const args = form.argsText.split(/\s+/).filter(Boolean);
    await createRequirement(selectedId, {
      name: form.name,
      type: form.type,
      command: form.type === 'tool_version' ? form.command : null,
      args: form.type === 'tool_version' ? args : [],
      operator: form.type === 'tool_version' ? form.operator : null,
      expected_value: form.expectedValue,
      severity: form.severity,
      remediation: form.remediation,
      role_ids: form.roleIds
    });
    setForm(emptyRequirement); await loadDetails(selectedId); await loadProjects();
  });

  const removeRequirement = guard(async (id) => {
    await deleteRequirement(id); await loadDetails(selectedId); await loadProjects();
  });

  const changeAccountType = guard(async (u, accountType) => {
    await setAccountType(u.id, accountType); await loadUsers();
  });

  const toggleRole = (id) => setForm({ ...form, roleIds: form.roleIds.includes(id) ? form.roleIds.filter((x) => x !== id) : [...form.roleIds, id] });

  return <main>
    <aside className="stack">
      <div className="card">
        <h2>Projects</h2>
        <div className="list">
          {projects.map((p) => <button className={p.id === selectedId ? 'project active' : 'project'} key={p.id} onClick={() => setSelectedId(p.id)}><b>{p.name}</b><span>{p.role_count} roles · {p.requirement_count} requirements</span></button>)}
        </div>
        <form onSubmit={addProject} className="stack divider">
          <h3>New project</h3>
          <input placeholder="Name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
          <textarea placeholder="Description" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
          <button className="primary">Create project</button>
        </form>
      </div>

      <div className="card">
        <h2>Users</h2>
        <div className="list">
          {users.map((u) => <div className="user-row" key={u.id}>
            <span>{u.username}</span>
            {u.id === user.id ? <span className="pill">you</span> :
              <select value={u.account_type} onChange={(e) => changeAccountType(u, e.target.value)}>
                <option value="developer">Developer</option><option value="maintainer">Maintainer</option>
              </select>}
          </div>)}
        </div>
      </div>
    </aside>

    <section className="content">
      {!project ? <div className="card">Create a project to begin.</div> : <>
        <div className="card hero"><div><small>PROJECT #{project.id}</small><h2>{project.name}</h2><p>{project.description || 'No description supplied.'}</p></div></div>

        <div className="card">
          <h2>Roles</h2>
          <p className="muted">People onboarding to this project pick one of these roles. Each role gets its own set of requirements.</p>
          <div className="chips">
            {roles.map((r) => <span className="chip" key={r.id}>{r.name}<button className="link" title="Delete role" onClick={() => removeRole(r)}>×</button></span>)}
            {!roles.length && <span className="muted">No roles yet. Developers can't run the agent until you add one.</span>}
          </div>
          <form onSubmit={addRole} className="inline-form">
            <input placeholder="e.g. Developer, Tester, DevOps" value={roleName} onChange={(e) => setRoleName(e.target.value)} required />
            <button className="primary">Add role</button>
          </form>
        </div>

        <div className="columns">
          <div className="card"><h2>Requirements</h2><div className="list">
            {requirements.map((r) => <div className="requirement" key={r.id}><div>
              <b>{r.name}</b><span className="pill">{r.severity}</span>
              <p><code>{r.type}</code> · Expected: {r.expected_value}</p>
              <p className="muted">Applies to: {r.role_ids.length ? r.role_ids.map((id) => roleNames[id]).join(', ') : 'all roles'}</p>
              {r.remediation && <small>{r.remediation}</small>}
            </div><button className="link" onClick={() => removeRequirement(r.id)}>Delete</button></div>)}
            {!requirements.length && <p className="muted">No requirements yet.</p>}
          </div></div>

          <div className="card"><h2>Add requirement</h2><form onSubmit={addRequirement} className="stack">
            <input placeholder="Display name" value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} required />
            <select value={form.type} onChange={(e) => setForm({...form, type:e.target.value})}><option value="tool_version">Tool version</option><option value="env_var">Environment variable</option><option value="file">File exists</option></select>
            {form.type === 'tool_version' && <><input placeholder="Executable e.g. node" value={form.command} onChange={(e) => setForm({...form, command:e.target.value})} required /><input placeholder="Arguments e.g. --version" value={form.argsText} onChange={(e) => setForm({...form,argsText:e.target.value})} /><select value={form.operator} onChange={(e) => setForm({...form,operator:e.target.value})}><option>&gt;=</option><option>&gt;</option><option>=</option><option>&lt;=</option><option>&lt;</option></select></>}
            <input placeholder={form.type === 'env_var' ? 'Variable name' : form.type === 'file' ? 'File path' : 'Expected version'} value={form.expectedValue} onChange={(e) => setForm({...form,expectedValue:e.target.value})} required />
            <select value={form.severity} onChange={(e) => setForm({...form,severity:e.target.value})}><option value="mandatory">Mandatory</option><option value="recommended">Recommended</option></select>
            <textarea placeholder="Remediation guidance" value={form.remediation} onChange={(e) => setForm({...form,remediation:e.target.value})} />
            {roles.length > 0 && <fieldset className="roles-field">
              <legend>Applies to roles <span className="muted">(none ticked = all roles)</span></legend>
              {roles.map((r) => <label key={r.id}><input type="checkbox" checked={form.roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} /> {r.name}</label>)}
            </fieldset>}
            <button className="primary">Add requirement</button>
          </form></div>
        </div>

        <div className="card"><div className="section-head"><div><small>TEAM</small><h2>Latest verifications</h2></div><button onClick={() => guard(loadDetails)(selectedId)}>Refresh</button></div>
          {!sessions.length ? <p className="muted">Nobody has run the agent for this project yet.</p> : <div className="list">
            {sessions.map((s) => <div key={s.id}>
              <button className={s.id === openSessionId ? 'project active' : 'project'} onClick={() => setOpenSessionId(s.id === openSessionId ? null : s.id)}>
                <b>{s.username} · {s.role_name || 'deleted role'}</b>
                <span>{sessionSummary(s)} · {s.started_at}</span>
              </button>
              {s.id === openSessionId && <div className="nested"><SessionResults session={s} /></div>}
            </div>)}
          </div>}
        </div>
      </>}
    </section>
  </main>;
}
