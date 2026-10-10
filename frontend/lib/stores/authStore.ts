'use client';

import { create } from 'zustand';

import { api } from '@/lib/services/http';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/services/tokens';

type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_staff: boolean;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  signIn: (args: { email: string; password: string; captcha_token?: string }) => Promise<void>;
  signUp: (args: { email: string; password: string; first_name?: string; last_name?: string; captcha_token?: string }) => Promise<{ email: string }>;
  verifyRegistration: (args: { email: string; code: string; new_password: string }) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  signOut: () => void;
  syncFromCookies: () => void;
  restoreUser: () => Promise<void>;
  exchangeAdminHandoff: (handoff: string, canCommit: () => boolean) => Promise<boolean>;
  sendPasswordResetCode: (email: string) => Promise<void>;
  resetPassword: (args: { email: string; code: string; new_password: string }) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => {
  let restoreGeneration = 0;
  let handoffOperation = 0;
  let pendingRestore: {
    sessionKey: string;
    generation: number;
    promise: Promise<void>;
  } | null = null;

  const invalidateRestore = () => {
    restoreGeneration += 1;
    pendingRestore = null;
  };

  return {
    accessToken: getAccessToken(),
    refreshToken: getRefreshToken(),
    user: null,
    isAuthenticated: Boolean(getAccessToken()),

    syncFromCookies: () => {
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      set({ accessToken, refreshToken, isAuthenticated: Boolean(accessToken) });
    },

    exchangeAdminHandoff: async (handoff, canCommit) => {
      const generation = restoreGeneration;
      const operation = ++handoffOperation;
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
      // The public exchange must never refresh or attach the previous session.
      const response = await fetch(`${baseUrl}/admin-login/handoff/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoff }), credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) throw new Error('El enlace de acceso no es válido o ha expirado.');
      const data = await response.json();
      const user = data?.user;
      if (typeof data?.access !== 'string' || !data.access ||
          typeof data?.refresh !== 'string' || !data.refresh ||
          !user || typeof user.id !== 'number' || typeof user.email !== 'string' ||
          typeof user.first_name !== 'string' || typeof user.last_name !== 'string' ||
          typeof user.role !== 'string' || typeof user.is_staff !== 'boolean') {
        throw new Error('Respuesta de sesión inválida');
      }
      if (!canCommit() || generation !== restoreGeneration || operation !== handoffOperation) return false;
      invalidateRestore();
      setTokens({ access: data.access, refresh: data.refresh });
      set({ accessToken: data.access, refreshToken: data.refresh, user, isAuthenticated: true });
      return true;
    },

    signIn: async ({ email, password, captcha_token }) => {
      const response = await api.post('sign_in/', { email, password, captcha_token });
      const access = response.data?.access;
      const refresh = response.data?.refresh;
      const user = response.data?.user;

      if (!access || !refresh) {
        throw new Error('Respuesta de tokens inválida');
      }

      invalidateRestore();
      setTokens({ access, refresh });
      set({ user, isAuthenticated: true });
      get().syncFromCookies();
    },

    signUp: async ({ email, password, first_name, last_name, captcha_token }) => {
      const response = await api.post('sign_up/', {
        email,
        password,
        first_name,
        last_name,
        captcha_token,
      });
      return { email: response.data?.email ?? email };
    },

    verifyRegistration: async ({ email, code, new_password }) => {
      const response = await api.post('verify_registration/', { email, code, new_password });
      const access = response.data?.access;
      const refresh = response.data?.refresh;
      const user = response.data?.user;

      if (!access || !refresh) {
        throw new Error('Respuesta de tokens inválida');
      }

      invalidateRestore();
      setTokens({ access, refresh });
      set({ user, isAuthenticated: true });
      get().syncFromCookies();
    },

    resendVerification: async (email: string) => {
      await api.post('resend_verification/', { email });
    },

    signOut: () => {
      invalidateRestore();
      clearTokens();
      set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
      if (typeof window !== 'undefined') window.location.replace('/');
    },

    restoreUser: async () => {
      const token = getAccessToken();
      if (!token) return;

      // A refresh rotates the access token without changing the session identity.
      const refreshToken = getRefreshToken();
      const sessionKey = refreshToken ? `refresh:${refreshToken}` : `access:${token}`;
      const generation = restoreGeneration;
      if (pendingRestore?.sessionKey === sessionKey && pendingRestore.generation === generation) {
        return pendingRestore.promise;
      }

      // Defer the request until its shared record is installed, even for sync failures.
      const promise: Promise<void> = Promise.resolve().then(async () => {
        const isCurrent = () => pendingRestore?.promise === promise && restoreGeneration === generation;
        try {
          const response = await api.get('validate_token/');
          if (!isCurrent()) return;
          const data = response.data;
          if (data?.valid && data?.user) {
            set({ user: data.user, isAuthenticated: true });
          } else {
            clearTokens();
            set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
          }
        } catch {
          if (!isCurrent()) return;
          clearTokens();
          set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
        } finally {
          if (isCurrent()) pendingRestore = null;
        }
      });
      pendingRestore = { sessionKey, generation, promise };
      return promise;
    },

    sendPasswordResetCode: async (email: string) => {
      await api.post('send_passcode/', { email });
    },

    resetPassword: async ({ email, code, new_password }) => {
      await api.post('verify_passcode_and_reset_password/', {
        email,
        code,
        new_password
      });
    },
  };
});
