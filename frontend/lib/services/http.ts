'use client';

import axios, { type InternalAxiosRequestConfig } from 'axios';

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/services/tokens';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
});

type SessionRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean; _authRefreshToken?: string | null };

api.interceptors.request.use((config) => {
  (config as SessionRequestConfig)._authRefreshToken = getRefreshToken();
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RefreshResult = { kind: 'success'; access: string } | { kind: 'failed' } | { kind: 'superseded' };
let pendingRefresh: { refresh: string; promise: Promise<RefreshResult> } | null = null;

const refreshAccessToken = async (refresh: string): Promise<RefreshResult> => {
  try {
    const response = await axios.post(`${API_BASE_URL}/token/refresh/`, { refresh });
    if (getRefreshToken() !== refresh) return { kind: 'superseded' };
    const access = response.data?.access;
    if (!access) return { kind: 'failed' };
    setTokens({ access, refresh });
    return { kind: 'success', access };
  } catch {
    if (getRefreshToken() !== refresh) return { kind: 'superseded' };
    clearTokens();
    return { kind: 'failed' };
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as SessionRequestConfig | undefined;
    const status = error?.response?.status;
    const hadAuthHeader = Boolean(originalRequest?.headers?.Authorization);

    if (status !== 401 || !originalRequest || originalRequest._retry || !hadAuthHeader) {
      return Promise.reject(error);
    }

    const refresh = originalRequest._authRefreshToken;
    // A delayed 401 must never refresh or replay a request under a different user.
    if (!refresh || getRefreshToken() !== refresh) return Promise.reject(error);
    originalRequest._retry = true;

    if (pendingRefresh?.refresh !== refresh) {
      pendingRefresh = { refresh, promise: refreshAccessToken(refresh) };
    }
    const record = pendingRefresh;
    const result = await record.promise;
    if (pendingRefresh === record) pendingRefresh = null;

    if (result.kind === 'superseded') return Promise.reject(error);
    if (result.kind === 'failed') {
      const currentRefresh = getRefreshToken();
      if ((!currentRefresh || currentRefresh === refresh) && typeof window !== 'undefined') {
        window.location.replace('/');
      }
      return Promise.reject(error);
    }
    if (getRefreshToken() !== refresh) return Promise.reject(error);
    const newAccess = result.access;

    originalRequest.headers = originalRequest.headers ?? {};
    originalRequest.headers.Authorization = `Bearer ${newAccess}`;
    return api(originalRequest);
  }
);
