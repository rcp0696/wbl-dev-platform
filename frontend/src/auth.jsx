import { createContext, useContext, useEffect, useState } from 'react';
import * as api from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(api.getToken()));

  function clear() { api.setToken(null); setUser(null); }

  useEffect(() => {
    api.setUnauthorizedHandler(clear);
    if (!api.getToken()) return;
    api.getMe().then(setUser).catch(clear).finally(() => setLoading(false));
  }, []);

  async function signIn(mode, credentials) {
    const { token, user } = await (mode === 'register' ? api.register(credentials) : api.login(credentials));
    api.setToken(token);
    setUser(user);
  }

  async function signOut() {
    try { await api.logout(); } catch {}
    clear();
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}
