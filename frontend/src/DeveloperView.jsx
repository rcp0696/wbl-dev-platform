import { useEffect, useMemo, useState } from 'react';
import { createAgentRun, getMyLatestSession, getProjects, getRoles } from './api';
import SessionResults from './SessionResults';

export default function DeveloperView({ onError }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState(null);
  const [run, setRun] = useState(null);
  const [latestSession, setLatestSession] = useState(null);
  const [copied, setCopied] = useState(false);

  const project = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);
  const role = useMemo(() => roles.find((r) => r.id === roleId) || null, [roles, roleId]);
  const command = run && `node index.js ${run.token}`;

  const guard = (fn) => (...args) => fn(...args).catch((e) => onError(e.message));

  async function loadLatest() {
    setLatestSession(selectedId && roleId ? await getMyLatestSession(selectedId, roleId) : null);
  }

  useEffect(() => { guard(async () => setProjects(await getProjects()))(); }, []);

  useEffect(() => {
    setRoles([]); setRoleId(null); setRun(null);
    if (selectedId) guard(async () => setRoles(await getRoles(selectedId)))();
  }, [selectedId]);

  useEffect(() => { setRun(null); guard(loadLatest)(); }, [roleId]);

  const generate = guard(async () => {
    setRun(await createAgentRun(selectedId, roleId)); setCopied(false);
  });

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
  }

  return <main>
    <aside className="card">
      <small>STEP 1</small>
      <h2>Your project</h2>
      <div className="list">
        {projects.map((p) => <button className={p.id === selectedId ? 'project active' : 'project'} key={p.id} onClick={() => setSelectedId(p.id)}><b>{p.name}</b><span>{p.description || `${p.role_count} roles`}</span></button>)}
        {!projects.length && <p className="muted">No projects have been set up yet. Ask a maintainer.</p>}
      </div>
    </aside>

    <section className="content">
      {!project ? <div className="card">Choose the project you're onboarding to.</div> : <>
        <div className="card">
          <small>STEP 2</small>
          <h2>Your role on {project.name}</h2>
          {!roles.length ? <p className="muted">This project has no roles yet. Ask a maintainer to add one.</p> :
            <div className="chips">
              {roles.map((r) => <button key={r.id} className={r.id === roleId ? 'chip active' : 'chip'} onClick={() => setRoleId(r.id)}>{r.name}</button>)}
            </div>}
        </div>

        {role && <>
          <div className="card hero">
            <div>
              <small>STEP 3</small>
              <h2>Run the local agent</h2>
              <p>Generate a one-time command, then run it from the <code>agent</code> folder in the directory you want checked. It expires after 15 minutes and works once.</p>
            </div>
            <div className="run">
              <span>Verify as {role.name}</span>
              {run ? <><code className="token">{command}</code><button onClick={copy}>{copied ? 'Copied' : 'Copy command'}</button></> :
                <button className="primary" onClick={generate}>Generate agent command</button>}
            </div>
          </div>

          <div className="card"><div className="section-head"><div><small>YOUR RESULTS</small><h2>Latest verification as {role.name}</h2></div><button onClick={() => guard(loadLatest)()}>Refresh</button></div>
            <SessionResults session={latestSession} />
          </div>
        </>}
      </>}
    </section>
  </main>;
}
