const TOKEN_KEY = 'onboarding_token';
let onUnauthorized = () => {};

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
export const setUnauthorizedHandler = (handler) => { onUnauthorized = handler; };

async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  let body = null;
  try { body = await response.json(); } catch {}
  // An expired or revoked login sends the user back to the login screen.
  if (response.status === 401 && token) onUnauthorized();
  if (!response.ok) throw new Error(body?.error || `Request failed: ${response.status}`);
  return body;
}

const post = (path, x) => api(path, { method: 'POST', body: JSON.stringify(x) });

export const login = (x) => post('/auth/login', x);
export const register = (x) => post('/auth/register', x);
export const logout = () => api('/auth/logout', { method: 'POST' });
export const getMe = () => api('/auth/me');

export const getUsers = () => api('/users');
export const setAccountType = (id, account_type) => api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ account_type }) });

export const getProjects = () => api('/projects');
export const createProject = (x) => post('/projects', x);
export const getRoles = (id) => api(`/projects/${id}/roles`);
export const createRole = (id, x) => post(`/projects/${id}/roles`, x);
export const deleteRole = (id) => api(`/roles/${id}`, { method: 'DELETE' });
export const getRequirements = (id) => api(`/projects/${id}/requirements`);
export const createRequirement = (id, x) => post(`/projects/${id}/requirements`, x);
export const deleteRequirement = (id) => api(`/requirements/${id}`, { method: 'DELETE' });

export const createAgentRun = (id, roleId) => post(`/projects/${id}/runs`, { role_id: roleId });
export const getMyLatestSession = (id, roleId) => api(`/projects/${id}/my-latest-session?role_id=${roleId}`);
export const getProjectSessions = (id) => api(`/projects/${id}/sessions`);
