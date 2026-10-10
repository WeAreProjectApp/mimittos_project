import { describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../tokens', () => ({
  clearTokens: jest.fn(),
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setTokens: jest.fn(),
}));

let requestInterceptor: ((config: any) => any) | null = null;
let responseSuccessInterceptor: ((response: any) => any) | null = null;
let responseErrorInterceptor: ((error: any) => Promise<any>) | null = null;
type MockApiInstance = jest.Mock<Promise<any>, any> & { interceptors: any };
let apiInstance: MockApiInstance;
let mockAxios: any;
let mockGetAccessToken: jest.Mock;
let mockGetRefreshToken: jest.Mock;
let mockSetTokens: jest.Mock;
let mockClearTokens: jest.Mock;

describe('http service', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const axiosModule = await import('axios');
    mockAxios = axiosModule.default;

    const tokensModule = await import('../tokens');
    mockGetAccessToken = tokensModule.getAccessToken as unknown as jest.Mock;
    mockGetRefreshToken = tokensModule.getRefreshToken as unknown as jest.Mock;
    mockSetTokens = tokensModule.setTokens as unknown as jest.Mock;
    mockClearTokens = tokensModule.clearTokens as unknown as jest.Mock;

    requestInterceptor = null;
    responseSuccessInterceptor = null;
    responseErrorInterceptor = null;
    apiInstance = jest.fn() as MockApiInstance;
    apiInstance.interceptors = {
      request: {
        use: jest.fn((handler) => {
          requestInterceptor = handler;
        }),
      },
      response: {
        use: jest.fn((success, handler) => {
          responseSuccessInterceptor = success;
          responseErrorInterceptor = handler;
        }),
      },
    };

    mockAxios.create.mockReturnValue(apiInstance);
    mockAxios.post.mockResolvedValue({ data: {} });
    mockGetAccessToken.mockReturnValue(null);
    mockGetRefreshToken.mockReturnValue(null);
  });

  it('adds Authorization header when access token exists', async () => {
    mockGetAccessToken.mockReturnValue('token');
    await import('../http');

    const config = {};
    const result = requestInterceptor?.(config);

    expect(result.headers.Authorization).toBe('Bearer token');
  });

  it('keeps request headers unchanged when no access token', async () => {
    await import('../http');

    const config = {};
    const result = requestInterceptor?.(config);

    expect(result.headers).toBeUndefined();
  });

  it('rejects non-401 errors', async () => {
    await import('../http');

    const error = { response: { status: 500 } };

    await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
  });

  it('rejects 401 errors without request config', async () => {
    await import('../http');

    const error = { response: { status: 401 } };

    await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
  });

  it('returns response from success interceptor', async () => {
    await import('../http');

    const response = { data: { ok: true } };
    const result = responseSuccessInterceptor?.(response);

    expect(result).toBe(response);
  });

  it('rejects 401 when no refresh token is available', async () => {
    await import('../http');

    const error = { response: { status: 401 }, config: {} };

    await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
  });

  it('refreshes token and retries the request', async () => {
    mockGetRefreshToken.mockReturnValue('refresh');
    mockAxios.post.mockResolvedValueOnce({ data: { access: 'new-access' } });
    apiInstance.mockResolvedValueOnce('retried');

    await import('../http');

    const error = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer expired' } }) };

    const result = await responseErrorInterceptor?.(error);

    expect(mockSetTokens).toHaveBeenCalledWith({ access: 'new-access', refresh: 'refresh' });
    expect(apiInstance).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer new-access' }) })
    );
    expect(result).toBe('retried');
  });

  it('reuses refresh promise for concurrent 401 responses', async () => {
    mockGetRefreshToken.mockReturnValue('refresh');
    let resolvePost: (value: any) => void;
    const postPromise: Promise<any> = new Promise((resolve) => {
      resolvePost = resolve;
    });
    mockAxios.post.mockReturnValueOnce(postPromise);
    apiInstance.mockResolvedValue('retried');

    await import('../http');

    const errorOne = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer expired' } }) };
    const errorTwo = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer expired' } }) };

    const firstAttempt = responseErrorInterceptor?.(errorOne);
    const secondAttempt = responseErrorInterceptor?.(errorTwo);

    expect(mockAxios.post).toHaveBeenCalledTimes(1);

    resolvePost!({ data: { access: 'new-access' } });

    await expect(firstAttempt).resolves.toBe('retried');
    await expect(secondAttempt).resolves.toBe('retried');
    expect(apiInstance).toHaveBeenCalledTimes(2);
  });

  it('rejects when refresh token response is missing access', async () => {
    mockGetRefreshToken.mockReturnValue('refresh');
    mockAxios.post.mockResolvedValueOnce({ data: {} });

    await import('../http');

    const error = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer expired' } }) };

    await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  it('clears tokens when refresh fails', async () => {
    mockGetRefreshToken.mockReturnValue('refresh');
    mockAxios.post.mockRejectedValueOnce(new Error('refresh failed'));

    await import('../http');

    const error = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer expired' } }) };

    await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
  });

  it('rejects when request already retried', async () => {
    mockGetRefreshToken.mockReturnValue('refresh');
    await import('../http');

    const error = { response: { status: 401 }, config: { _retry: true } };

    await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });
  describe('session boundary', () => {
    function pendingRefresh() {
      let resolve!: (value: { data: { access: string } }) => void;
      let reject!: (reason: Error) => void;
      const promise = new Promise<{ data: { access: string } }>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      return { promise, resolve, reject };
    }

    it('ignores a refresh result belonging to the previous session', async () => {
      const pending = pendingRefresh();
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockAxios.post.mockReturnValueOnce(pending.promise);
      await import('../http');
      const config = requestInterceptor?.({ headers: { Authorization: 'Bearer old' } });
      const error = { response: { status: 401 }, config };
      const attempt = responseErrorInterceptor?.(error);
      mockGetRefreshToken.mockReturnValue('new-refresh');
      pending.resolve({ data: { access: 'old-rotated-access' } });
      await expect(attempt).rejects.toBe(error);
      expect(mockSetTokens).not.toHaveBeenCalled();
      expect(mockClearTokens).not.toHaveBeenCalled();
      expect(apiInstance).not.toHaveBeenCalled();
    });

    it('preserves a new session when an old refresh fails', async () => {
      const pending = pendingRefresh();
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockAxios.post.mockReturnValueOnce(pending.promise);
      await import('../http');
      const config = requestInterceptor?.({ headers: { Authorization: 'Bearer old' } });
      const error = { response: { status: 401 }, config };
      const attempt = responseErrorInterceptor?.(error);
      mockGetRefreshToken.mockReturnValue('new-refresh');
      pending.reject(new Error('revoked old refresh'));
      await expect(attempt).rejects.toBe(error);
      expect(mockClearTokens).not.toHaveBeenCalled();
      expect(mockSetTokens).not.toHaveBeenCalled();
      expect(apiInstance).not.toHaveBeenCalled();
    });

    it('does not refresh a stale request under the new identity', async () => {
      mockGetRefreshToken.mockReturnValue('old-refresh');
      await import('../http');
      const config = requestInterceptor?.({ headers: { Authorization: 'Bearer old' } });
      mockGetRefreshToken.mockReturnValue('new-refresh');
      const error = { response: { status: 401 }, config };
      await expect(responseErrorInterceptor?.(error)).rejects.toBe(error);
      expect(mockAxios.post).not.toHaveBeenCalled();
      expect(mockClearTokens).not.toHaveBeenCalled();
      expect(apiInstance).not.toHaveBeenCalled();
    });

    it('does not resurrect a signed-out session from a pending refresh', async () => {
      const pending = pendingRefresh();
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockAxios.post.mockReturnValueOnce(pending.promise);
      await import('../http');
      const config = requestInterceptor?.({ headers: { Authorization: 'Bearer old' } });
      const error = { response: { status: 401 }, config };
      const attempt = responseErrorInterceptor?.(error);
      mockGetRefreshToken.mockReturnValue(null);
      pending.resolve({ data: { access: 'old-rotated-access' } });
      await expect(attempt).rejects.toBe(error);
      expect(mockSetTokens).not.toHaveBeenCalled();
      expect(apiInstance).not.toHaveBeenCalled();
    });

    it('starts a separate refresh for a newer session', async () => {
      const oldPending = pendingRefresh();
      const newPending = pendingRefresh();
      mockGetRefreshToken.mockReturnValue('old-refresh');
      mockAxios.post.mockReturnValueOnce(oldPending.promise).mockReturnValueOnce(newPending.promise);
      apiInstance.mockResolvedValue('retried-new');
      await import('../http');
      const oldError = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer old' } }) };
      const oldAttempt = responseErrorInterceptor?.(oldError);
      mockGetRefreshToken.mockReturnValue('new-refresh');
      const newError = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer new' } }) };
      const newAttempt = responseErrorInterceptor?.(newError);
      const oldRejected = expect(oldAttempt).rejects.toBe(oldError);
      oldPending.resolve({ data: { access: 'old-result' } });
      await oldRejected;
      const sameSessionError = { response: { status: 401 }, config: requestInterceptor?.({ headers: { Authorization: 'Bearer new' } }) };
      const sharedAttempt = responseErrorInterceptor?.(sameSessionError);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      newPending.resolve({ data: { access: 'new-result' } });
      await expect(newAttempt).resolves.toBe('retried-new');
      await expect(sharedAttempt).resolves.toBe('retried-new');
      expect(mockSetTokens).toHaveBeenCalledTimes(1);
      expect(mockSetTokens).toHaveBeenCalledWith({ access: 'new-result', refresh: 'new-refresh' });
      expect(apiInstance).toHaveBeenCalledTimes(2);
    });
  });

});
