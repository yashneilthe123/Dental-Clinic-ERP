import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then(setUser)
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const login = async (email, password) => {
    const { token, user: u } = await api.post('/auth/login', { email, password });
    tokenStore.set(token);
    setUser(u);
    return u;
  };

  /** can('admin','dentist') — admins can always do everything */
  const can = (...roles) => !!user && (user.role === 'admin' || roles.includes(user.role));

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
