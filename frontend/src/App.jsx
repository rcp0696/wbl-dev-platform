import { useState } from 'react';
import { useAuth } from './auth';
import Login from './Login';
import MaintainerDashboard from './MaintainerDashboard';
import DeveloperView from './DeveloperView';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [error, setError] = useState('');

  return <div className="app">
    <header>
      <div><small>WBL II PROTOTYPE</small><h1>Developer Onboarding Platform</h1></div>
      {user && <div className="account"><span>{user.username}</span><span className="pill">{user.account_type}</span><button onClick={signOut}>Log out</button></div>}
    </header>
    {error && <div className="error">{error}<button onClick={() => setError('')}>×</button></div>}
    {loading ? null : !user ? <Login /> :
      user.account_type === 'maintainer' ? <MaintainerDashboard onError={setError} /> : <DeveloperView onError={setError} />}
  </div>;
}
