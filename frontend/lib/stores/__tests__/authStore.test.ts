import { describe, it, expect, beforeEach } from '@jest/globals';
import { act } from '@testing-library/react';

import { useAuthStore } from '../authStore';
import { api } from '../../services/http';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../../services/tokens';

jest.mock('../../services/http', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('../../services/tokens', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;
const mockGetAccessToken = getAccessToken as jest.Mock;
const mockGetRefreshToken = getRefreshToken as jest.Mock;
const mockSetTokens = setTokens as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;

const restoredUser = {
  id: 7,
  email: 'restore@example.com',
  first_name: 'Restore',
  last_name: 'User',
  role: 'customer',
  is_staff: false,
};

const signedInUser = {
  id: 11,
  email: 'signed-in@example.com',
  first_name: 'Signed',
  last_name: 'In',
  role: 'customer',
  is_staff: false,
};

const verifiedUser = {
  id: 13,
  email: 'verified@example.com',
  first_name: 'Verified',
  last_name: 'User',
  role: 'customer',
  is_staff: false,
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const currentAuth = () => {
  const { accessToken, refreshToken, user, isAuthenticated } = useAuthStore.getState();
  return { accessToken, refreshToken, user, isAuthenticated };
};

const startRestoreCalls = (count: number) =>
  Array.from({ length: count }, () => useAuthStore.getState().restoreUser());

const resetAuthState = () => {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
};

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthState();
    mockGetAccessToken.mockReturnValue(null);
    mockGetRefreshToken.mockReturnValue(null);
  });

  it('syncs tokens from cookies', () => {
    mockGetAccessToken.mockReturnValue('access');
    mockGetRefreshToken.mockReturnValue('refresh');

    act(() => {
      useAuthStore.getState().syncFromCookies();
    });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access');
    expect(state.refreshToken).toBe('refresh');
    expect(state.isAuthenticated).toBe(true);
  });

  it('signs in successfully', async () => {
    mockGetAccessToken.mockReturnValue('access');
    mockGetRefreshToken.mockReturnValue('refresh');
    mockApi.post.mockResolvedValueOnce({
      data: {
        access: 'access',
        refresh: 'refresh',
        user: {
          id: 1,
          email: 'user@example.com',
          first_name: 'Test',
          last_name: 'User',
          role: 'customer',
          is_staff: false,
        },
      },
    });

    await act(async () => {
      await useAuthStore.getState().signIn({ email: 'user@example.com', password: 'password' });
    });

    expect(mockSetTokens).toHaveBeenCalledWith({ access: 'access', refresh: 'refresh' });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe('user@example.com');
  });

  it('throws when sign in response is missing tokens', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { access: null, refresh: null } });

    await expect(useAuthStore.getState().signIn({ email: 'user@example.com', password: 'password' })).rejects.toThrow(
      'Respuesta de tokens inválida'
    );
  });

  it('returns the registered email', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { email: 'new@example.com' },
    });

    let result: { email: string } | undefined;
    await act(async () => {
      result = await useAuthStore.getState().signUp({ email: 'new@example.com', password: 'password' });
    });

    expect(mockSetTokens).not.toHaveBeenCalled();
    expect(result).toEqual({ email: 'new@example.com' });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('returns email from signUp even when response email is missing', async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });

    let result: { email: string } | undefined;
    await act(async () => {
      result = await useAuthStore.getState().signUp({ email: 'new@example.com', password: 'password' });
    });

    expect(result).toEqual({ email: 'new@example.com' });
  });

  it('clears stored auth on sign out', () => {
    useAuthStore.setState({ isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh' });

    act(() => {
      useAuthStore.getState().signOut();
    });

    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('sends a password reset code', async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });

    await act(async () => {
      await useAuthStore.getState().sendPasswordResetCode('user@example.com');
    });

    expect(mockApi.post).toHaveBeenCalledWith('send_passcode/', { email: 'user@example.com' });
  });

  it('resets password', async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });

    await act(async () => {
      await useAuthStore
        .getState()
        .resetPassword({ email: 'user@example.com', code: '123456', new_password: 'password123' });
    });

    expect(mockApi.post).toHaveBeenCalledWith('verify_passcode_and_reset_password/', {
      email: 'user@example.com',
      code: '123456',
      new_password: 'password123',
    });
  });

  it('restores the current user from validate_token', async () => {
    mockGetAccessToken.mockReturnValue('access');
    mockApi.get.mockResolvedValueOnce({
      data: {
        valid: true,
        user: {
          id: 7,
          email: 'restore@example.com',
          first_name: 'Restore',
          last_name: 'User',
          role: 'customer',
          is_staff: false,
        },
      },
    });

    await act(async () => {
      await useAuthStore.getState().restoreUser();
    });

    expect(mockApi.get).toHaveBeenCalledWith('validate_token/');
    expect(useAuthStore.getState().user?.email).toBe('restore@example.com');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('clears auth state when restoreUser fails', async () => {
    mockGetAccessToken.mockReturnValue('access');
    mockApi.get.mockRejectedValueOnce(new Error('boom'));
    useAuthStore.setState({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 1, email: 'user@example.com', first_name: 'T', last_name: 'U', role: 'customer', is_staff: false },
      isAuthenticated: true,
    });

    await act(async () => {
      await useAuthStore.getState().restoreUser();
    });

    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  describe('restoreUser concurrency', () => {
    it.each([2, 50])('shares one validation request for %i concurrent restores', async (callCount) => {
      // Fails if concurrent consumers each send their own validate_token request.
      const deferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      mockGetAccessToken.mockReturnValue('access');
      mockGetRefreshToken.mockReturnValue('refresh');
      mockApi.get.mockReturnValueOnce(deferred.promise as never);

      const restores = startRestoreCalls(callCount);
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(mockApi.get).toHaveBeenCalledWith('validate_token/');

      await act(async () => {
        deferred.resolve({ data: { valid: true, user: restoredUser } });
        await Promise.all(restores);
      });

      expect(currentAuth()).toEqual({
        accessToken: null,
        refreshToken: null,
        user: restoredUser,
        isAuthenticated: true,
      });
    });

    it('keeps auth state unchanged without an access token', async () => {
      // Fails if restoreUser makes a validation request without a browser session.
      useAuthStore.setState({
        accessToken: 'retained-access',
        refreshToken: 'retained-refresh',
        user: restoredUser,
        isAuthenticated: true,
      });

      await act(async () => {
        await useAuthStore.getState().restoreUser();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(0);
      expect(currentAuth()).toEqual({
        accessToken: 'retained-access',
        refreshToken: 'retained-refresh',
        user: restoredUser,
        isAuthenticated: true,
      });
    });

    it('clears stored auth after an invalid validation response', async () => {
      // Fails if an invalid validate_token response leaves a stale authenticated user.
      mockGetAccessToken.mockReturnValue('access');
      mockApi.get.mockResolvedValueOnce({ data: { valid: false } });
      useAuthStore.setState({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: restoredUser,
        isAuthenticated: true,
      });

      await act(async () => {
        await useAuthStore.getState().restoreUser();
      });

      expect(mockClearTokens).toHaveBeenCalledTimes(1);
      expect(currentAuth()).toEqual({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
    });

    it('starts a new validation after a successful restoration', async () => {
      // Fails if a completed restore remains cached and hides a later session validation.
      mockGetAccessToken.mockReturnValue('access');
      mockApi.get
        .mockResolvedValueOnce({ data: { valid: true, user: restoredUser } })
        .mockResolvedValueOnce({ data: { valid: true, user: verifiedUser } });

      await act(async () => {
        await useAuthStore.getState().restoreUser();
        await useAuthStore.getState().restoreUser();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(currentAuth().user).toEqual(verifiedUser);
    });

    it('retries validation after a rejected restoration', async () => {
      // Fails if a rejected restore permanently blocks validation of the same session.
      mockGetAccessToken.mockReturnValue('access');
      mockApi.get
        .mockRejectedValueOnce(new Error('network failure'))
        .mockResolvedValueOnce({ data: { valid: true, user: restoredUser } });

      await act(async () => {
        await useAuthStore.getState().restoreUser();
      });

      expect(currentAuth()).toEqual({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });

      await act(async () => {
        await useAuthStore.getState().restoreUser();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(currentAuth().user).toEqual(restoredUser);
    });

    it('shares a pending validation after access token rotation', async () => {
      // Fails if a refreshed access token starts a duplicate validation for the same refresh session.
      const deferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      mockGetAccessToken.mockReturnValueOnce('expired-access').mockReturnValueOnce('rotated-access');
      mockGetRefreshToken.mockReturnValue('stable-refresh');
      mockApi.get.mockReturnValueOnce(deferred.promise as never);

      const firstRestore = useAuthStore.getState().restoreUser();
      const secondRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(1);

      await act(async () => {
        deferred.resolve({ data: { valid: true, user: restoredUser } });
        await Promise.all([firstRestore, secondRestore]);
      });

      expect(currentAuth().user).toEqual(restoredUser);
    });

    it('keeps signed-out state after a late validation response', async () => {
      // Fails if a response that started before signOut restores the previous user.
      const deferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      mockGetAccessToken.mockReturnValue('access');
      mockGetRefreshToken.mockReturnValue('refresh');
      mockApi.get.mockReturnValueOnce(deferred.promise as never);

      const restore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
        useAuthStore.getState().signOut();
      });

      await act(async () => {
        deferred.resolve({ data: { valid: true, user: restoredUser } });
        await restore;
      });

      expect(currentAuth()).toEqual({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
    });

    it('keeps the new user after a stale restoration error', async () => {
      // Fails if a rejected response from the old session clears a newly signed-in user.
      const deferred = createDeferred<never>();
      mockGetAccessToken.mockReturnValue('old-access');
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockApi.get.mockReturnValueOnce(deferred.promise as never);
      mockApi.post.mockResolvedValueOnce({
        data: { access: 'new-access', refresh: 'new-refresh', user: signedInUser },
      });

      const restore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      mockGetAccessToken.mockReturnValue('new-access');
      mockGetRefreshToken.mockReturnValue('new-refresh');
      await act(async () => {
        await useAuthStore.getState().signIn({ email: signedInUser.email, password: 'password' });
      });

      await act(async () => {
        deferred.reject(new Error('old session failed'));
        await restore;
      });

      expect(mockClearTokens).toHaveBeenCalledTimes(0);
      expect(currentAuth()).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: signedInUser,
        isAuthenticated: true,
      });
    });

    it('keeps the verified user after a stale restoration response', async () => {
      // Fails if a response from the pre-verification session overwrites the verified user.
      const deferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      mockGetAccessToken.mockReturnValue('old-access');
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockApi.get.mockReturnValueOnce(deferred.promise as never);
      mockApi.post.mockResolvedValueOnce({
        data: { access: 'verified-access', refresh: 'verified-refresh', user: verifiedUser },
      });

      const restore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      mockGetAccessToken.mockReturnValue('verified-access');
      mockGetRefreshToken.mockReturnValue('verified-refresh');
      await act(async () => {
        await useAuthStore.getState().verifyRegistration({ email: verifiedUser.email, code: '123456', new_password: 'OwnerPassword123!' });
      });

      await act(async () => {
        deferred.resolve({ data: { valid: true, user: restoredUser } });
        await restore;
      });

      expect(currentAuth()).toEqual({
        accessToken: 'verified-access',
        refreshToken: 'verified-refresh',
        user: verifiedUser,
        isAuthenticated: true,
      });
      expect(mockApi.post).toHaveBeenCalledWith('verify_registration/', {
        email: verifiedUser.email, code: '123456', new_password: 'OwnerPassword123!',
      });
    });

    it('retains a newer pending validation after an old restoration settles', async () => {
      // Fails if the old finally block removes the newer session's pending validation.
      const oldDeferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      const newDeferred = createDeferred<{ data: { valid: boolean; user: typeof verifiedUser } }>();
      mockGetAccessToken.mockReturnValue('old-access');
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockApi.get
        .mockReturnValueOnce(oldDeferred.promise as never)
        .mockReturnValueOnce(newDeferred.promise as never);

      const oldRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
        useAuthStore.getState().signOut();
      });

      mockGetAccessToken.mockReturnValue('new-access');
      mockGetRefreshToken.mockReturnValue('new-refresh');
      const newRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        oldDeferred.resolve({ data: { valid: true, user: restoredUser } });
        await oldRestore;
      });

      const sharedNewRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(2);

      await act(async () => {
        newDeferred.resolve({ data: { valid: true, user: verifiedUser } });
        await Promise.all([newRestore, sharedNewRestore]);
      });

      expect(currentAuth().user).toEqual(verifiedUser);
    });

    it('shares a pending validation when only the access token identifies the session', async () => {
      // Fails if sessions without a refresh token send duplicate validation requests.
      const deferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      mockGetAccessToken.mockReturnValue('access-only-session');
      mockGetRefreshToken.mockReturnValue(null);
      mockApi.get.mockReturnValueOnce(deferred.promise as never);

      const firstRestore = useAuthStore.getState().restoreUser();
      const secondRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(1);

      await act(async () => {
        deferred.resolve({ data: { valid: true, user: restoredUser } });
        await Promise.all([firstRestore, secondRestore]);
      });

      expect(currentAuth().user).toEqual(restoredUser);
    });

    it('starts a separate validation for a different refresh token', async () => {
      // Fails if distinct refresh sessions share one response and restore the wrong user.
      const firstDeferred = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
      const secondDeferred = createDeferred<{ data: { valid: boolean; user: typeof verifiedUser } }>();
      mockGetAccessToken.mockReturnValue('first-access');
      mockGetRefreshToken.mockReturnValue('first-refresh');
      mockApi.get
        .mockReturnValueOnce(firstDeferred.promise as never)
        .mockReturnValueOnce(secondDeferred.promise as never);

      const firstRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      mockGetAccessToken.mockReturnValue('second-access');
      mockGetRefreshToken.mockReturnValue('second-refresh');
      const secondRestore = useAuthStore.getState().restoreUser();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockApi.get).toHaveBeenCalledTimes(2);

      await act(async () => {
        firstDeferred.resolve({ data: { valid: true, user: restoredUser } });
        secondDeferred.resolve({ data: { valid: true, user: verifiedUser } });
        await Promise.all([firstRestore, secondRestore]);
      });

      expect(currentAuth().user).toEqual(verifiedUser);
    });
  });
});

describe('admin handoff', () => {
  const mockFetch = jest.fn();
  const previousAuth = {
    accessToken: 'old-access', refreshToken: 'old-refresh', user: restoredUser, isAuthenticated: true,
  };
  const envelope = { access: 'handoff-access', refresh: 'handoff-refresh', user: verifiedUser };
  const acceptedResponse = () => ({ ok: true, json: async () => envelope });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch;
    useAuthStore.setState(previousAuth);
    mockGetAccessToken.mockReturnValue('old-access');
    mockGetRefreshToken.mockReturnValue('old-refresh');
  });

  it('accepts a customer handoff through an unauthenticated request', async () => {
    mockFetch.mockResolvedValueOnce(acceptedResponse());
    const accepted = await useAuthStore.getState().exchangeAdminHandoff('assertion', () => true);
    expect(accepted).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/admin-login/handoff/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handoff: 'assertion' }), credentials: 'omit', cache: 'no-store',
    });
    expect(mockSetTokens).toHaveBeenCalledWith({ access: envelope.access, refresh: envelope.refresh });
    expect(currentAuth()).toEqual({
      accessToken: envelope.access, refreshToken: envelope.refresh, user: verifiedUser, isAuthenticated: true,
    });
    expect(mockApi.get).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it.each([401, 403])('preserves the previous session on HTTP %i', async (status) => {
    mockFetch.mockResolvedValueOnce({ ok: false, status });
    await expect(useAuthStore.getState().exchangeAdminHandoff('bad', () => true)).rejects.toThrow();
    expect(currentAuth()).toEqual(previousAuth);
    expect(mockSetTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('preserves the previous session on a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(useAuthStore.getState().exchangeAdminHandoff('proof', () => true)).rejects.toThrow('offline');
    expect(currentAuth()).toEqual(previousAuth);
    expect(mockSetTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it('rejects an incomplete success envelope before replacing cookies', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...envelope, user: null }) });
    await expect(useAuthStore.getState().exchangeAdminHandoff('proof', () => true)).rejects.toThrow();
    expect(currentAuth()).toEqual(previousAuth);
    expect(mockSetTokens).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it('retains the session when the accepting page unmounted', async () => {
    mockFetch.mockResolvedValueOnce(acceptedResponse());
    const accepted = await useAuthStore.getState().exchangeAdminHandoff('proof', () => false);
    expect(accepted).toBe(false);
    expect(currentAuth()).toEqual(previousAuth);
    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  it('ignores a stale restoration after accepting the handoff', async () => {
    const pending = createDeferred<{ data: { valid: boolean; user: typeof restoredUser } }>();
    mockApi.get.mockReturnValueOnce(pending.promise as never);
    const restore = useAuthStore.getState().restoreUser();
    await Promise.resolve();
    mockFetch.mockResolvedValueOnce(acceptedResponse());
    await useAuthStore.getState().exchangeAdminHandoff('proof', () => true);
    pending.resolve({ data: { valid: true, user: restoredUser } });
    await restore;
    expect(currentAuth().user).toEqual(verifiedUser);
    expect(currentAuth().refreshToken).toBe(envelope.refresh);
  });

  it('ignores a stale restoration error after accepting the handoff', async () => {
    const pending = createDeferred<never>();
    mockApi.get.mockReturnValueOnce(pending.promise as never);
    const restore = useAuthStore.getState().restoreUser();
    await Promise.resolve();
    mockFetch.mockResolvedValueOnce(acceptedResponse());
    await useAuthStore.getState().exchangeAdminHandoff('proof', () => true);
    pending.reject(new Error('old session failed'));
    await restore;
    expect(currentAuth().user).toEqual(verifiedUser);
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it('does not install a pending handoff after sign out', async () => {
    const pending = createDeferred<ReturnType<typeof acceptedResponse>>();
    mockFetch.mockReturnValueOnce(pending.promise);
    const exchange = useAuthStore.getState().exchangeAdminHandoff('proof', () => true);
    useAuthStore.getState().signOut();
    pending.resolve(acceptedResponse());
    expect(await exchange).toBe(false);
    expect(currentAuth()).toEqual({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  it('does not replace a login completed after the handoff started', async () => {
    const pending = createDeferred<ReturnType<typeof acceptedResponse>>();
    mockFetch.mockReturnValueOnce(pending.promise);
    const exchange = useAuthStore.getState().exchangeAdminHandoff('proof', () => true);
    mockApi.post.mockResolvedValueOnce({ data: { access: 'new', refresh: 'new-refresh', user: signedInUser } });
    mockGetAccessToken.mockReturnValue('new');
    mockGetRefreshToken.mockReturnValue('new-refresh');
    await useAuthStore.getState().signIn({ email: signedInUser.email, password: 'password' });
    pending.resolve(acceptedResponse());
    expect(await exchange).toBe(false);
    expect(currentAuth().user).toEqual(signedInUser);
    expect(currentAuth().refreshToken).toBe('new-refresh');
    expect(mockSetTokens).toHaveBeenCalledTimes(1);
  });

  it('does not replace a newer handoff with an older response', async () => {
    const pending = createDeferred<ReturnType<typeof acceptedResponse>>();
    mockFetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(acceptedResponse());
    const older = useAuthStore.getState().exchangeAdminHandoff('old-proof', () => true);
    expect(await useAuthStore.getState().exchangeAdminHandoff('new-proof', () => true)).toBe(true);
    pending.resolve({ ok: true, json: async () => ({ ...envelope, user: restoredUser }) });
    expect(await older).toBe(false);
    expect(currentAuth().user).toEqual(verifiedUser);
    expect(mockSetTokens).toHaveBeenCalledTimes(1);
  });
});
