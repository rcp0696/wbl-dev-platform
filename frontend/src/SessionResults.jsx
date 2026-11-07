export default function SessionResults({ session }) {
  if (!session) return <p className="muted">No verification session yet.</p>;
  return <div className="results">{session.results.map((r) => <div className={`result ${r.status.toLowerCase()}`} key={r.id}>
    <b>{r.status}</b>
    <div>
      <strong>{r.requirement_name}</strong>
      <p>{r.message}</p>
      {r.detected_value && <small>Detected: {r.detected_value}</small>}
      {r.status !== 'PASS' && r.remediation && <div className="remediation"><b>How to resolve:</b> {r.remediation}</div>}
    </div>
  </div>)}</div>;
}

export function sessionSummary(session) {
  const passed = session.results.filter((r) => r.status === 'PASS').length;
  return `${passed}/${session.results.length} passed`;
}
