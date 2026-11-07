import { useState } from 'react';
import { useAuth } from './auth';

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await signIn(mode, { username, password }); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return <div className="login card">
    <small>{mode === 'login' ? 'WELCOME BACK' : 'NEW DEVELOPER'}</small>
    <h2>{mode === 'login' ? 'Log in' : 'Create a developer account'}</h2>
    {error && <div className="error">{error}</div>}
    <form onSubmit={submit} className="stack">
      <input placeholder="Username" autoComplete="username" maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)} required />
      <input type="password" placeholder="Password (at least 8 characters)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>
    <p className="muted">
      {mode === 'login' ? 'New here? ' : 'Already have an account? '}
      <button className="link-plain" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'Create a developer account' : 'Log in'}
      </button>
    </p>
    {mode === 'register' && <p className="muted">Maintainer access is granted by an existing maintainer.</p>}
  </div>;
}
