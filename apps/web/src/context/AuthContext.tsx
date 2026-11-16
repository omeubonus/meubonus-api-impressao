import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AdminUser } from '../types';
import { api } from '../lib/api';
import { socketManager } from '../lib/socket';

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('silentprint_token'));
  const [user, setUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('silentprint_user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    localStorage.removeItem('silentprint_token');
    localStorage.removeItem('silentprint_user');
    setToken(null);
    setUser(null);
    socketManager.disconnect();
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem('silentprint_token');
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    try {
      const { user: refreshedUser } = await api.getMe();
      setUser(refreshedUser);
      localStorage.setItem('silentprint_user', JSON.stringify(refreshedUser));
      socketManager.connect(storedToken);
    } catch (error) {
      console.warn('Falha ao validar sessão existente:', error);
      logout();
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();

    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [refreshUser, logout]);

  const login = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      const response = await api.login(credentials);
      localStorage.setItem('silentprint_token', response.token);
      localStorage.setItem('silentprint_user', JSON.stringify(response.user));
      setToken(response.token);
      setUser(response.user);
      socketManager.connect(response.token);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
