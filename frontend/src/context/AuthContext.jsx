import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setCsrfToken, setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setCsrfToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearAuth);
  }, [clearAuth]);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => {
        setUser({ username: res.data.username });
        setCsrfToken(res.data.csrfToken);
      })
      .catch(() => clearAuth())
      .finally(() => setLoading(false));
  }, [clearAuth]);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    setUser({ username: res.data.username });
    setCsrfToken(res.data.csrfToken);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
