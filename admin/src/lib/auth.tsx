import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  role: 'admin' | 'operator';
  totp_enabled: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('access_token');
    const userRaw = localStorage.getItem('user');
    if (token && userRaw) {
      try {
        return { token, user: JSON.parse(userRaw) };
      } catch {
        return { token: null, user: null };
      }
    }
    return { token: null, user: null };
  });

  const setAuth = useCallback((token: string, user: User) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setState({ token, user });
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setState({ token: null, user: null });
  }, []);

  return (
    <AuthContext.Provider value={{
      ...state,
      setAuth,
      clearAuth,
      isAdmin: state.user?.role === 'admin'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
