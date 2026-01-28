import { create } from 'zustand';
import { api } from '../lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  extension: string;
  displayName: string;
  status: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  guestLogin: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (credentials) => {
    const { token, user } = await api.post<{ token: string; user: User }>('/auth/login', credentials);
    api.setToken(token);
    set({ user, isAuthenticated: true });
  },

  register: async (data) => {
    const { token, user } = await api.post<{ token: string; user: User }>('/auth/register', data);
    api.setToken(token);
    set({ user, isAuthenticated: true });
  },

  guestLogin: async (displayName: string) => {
    const { token, user } = await api.post<{ token: string; user: User }>('/auth/guest', { displayName });
    api.setToken(token);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
        await api.post('/auth/logout', {});
    } catch (e) {
        console.error(e);
    }
    api.setToken(null);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const token = api.getToken();
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      
      const { user } = await api.get<{ user: User }>('/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      api.setToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
