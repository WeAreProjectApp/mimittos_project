import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBlogStore, selectBlogs, selectBlogsLoading, selectBlogsError } from '../blogStore';
import { api } from '../../services/http';
import { mockBlogs, mockBlog } from '../../__tests__/fixtures';

jest.mock('../../services/http', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('blogStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    useBlogStore.setState({ blogs: [], loading: false, error: null });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('fetchBlogs', () => {
    it('shares one pending request across simultaneous consumers', async () => {
      let resolveRequest: (value: { data: typeof mockBlogs }) => void = () => undefined;
      const pendingResponse = new Promise<{ data: typeof mockBlogs }>((resolve) => {
        resolveRequest = resolve;
      });
      mockApi.get.mockReturnValue(pendingResponse);

      let consumers: Promise<void>[] = [];
      act(() => {
        consumers = Array.from({ length: 50 }, () => useBlogStore.getState().fetchBlogs());
      });

      await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(1));
      expect(mockApi.get).toHaveBeenCalledWith('blogs/');

      // Fails if every consumer starts its own request before the first list resolves.
      await act(async () => {
        resolveRequest({ data: mockBlogs });
        await Promise.all(consumers);
      });

      expect(useBlogStore.getState()).toMatchObject({ blogs: mockBlogs, loading: false, error: null });
    });

    it('starts a new request after a completed refresh', async () => {
      const firstBlogs = [{ id: 1, title: 'Primero' }];
      const refreshedBlogs = [{ id: 2, title: 'Segundo' }];
      mockApi.get.mockResolvedValueOnce({ data: firstBlogs }).mockResolvedValueOnce({ data: refreshedBlogs });

      await act(async () => {
        await useBlogStore.getState().fetchBlogs();
      });
      await act(async () => {
        await useBlogStore.getState().fetchBlogs();
      });

      // Fails if the completed promise remains cached and returns the first response forever.
      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(useBlogStore.getState().blogs).toEqual([{ id: 2, title: 'Segundo' }]);
    });

    it('recovers with a fresh request after a failed load', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({ data: mockBlogs });

      await act(async () => {
        await useBlogStore.getState().fetchBlogs();
      });
      await act(async () => {
        await useBlogStore.getState().fetchBlogs();
      });

      // Fails if a rejected request stays cached or its error survives a successful recovery.
      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(useBlogStore.getState()).toMatchObject({ blogs: mockBlogs, error: null, loading: false });
    });

    it('should fetch blogs successfully', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockBlogs });

      const { result } = renderHook(() => useBlogStore());

      await act(async () => {
        await result.current.fetchBlogs();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.blogs).toEqual(mockBlogs);
        expect(result.current.error).toBeNull();
      });
    });

    it('should handle non-array response', async () => {
      mockApi.get.mockResolvedValueOnce({ data: { id: 1 } });

      const { result } = renderHook(() => useBlogStore());

      await act(async () => {
        await result.current.fetchBlogs();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.blogs).toEqual([]);
        expect(result.current.error).toBeNull();
      });
    });

    it('should handle fetch error', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useBlogStore());

      await act(async () => {
        await result.current.fetchBlogs();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe('Could not load blogs. Is the backend running?');
        expect(result.current.blogs).toEqual([]);
      });
    });

    it('should set loading state during fetch', async () => {
      // Create a promise that resolves after we check the loading state
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      mockApi.get.mockImplementation(() => promise);

      const { result } = renderHook(() => useBlogStore());

      act(() => {
        result.current.fetchBlogs();
      });

      expect(result.current.loading).toBe(true);
      
      // Resolve the promise to clean up
      await act(async () => {
        resolvePromise!({ data: [] });
        await promise;
      });
    });
  });

  describe('fetchBlog', () => {
    it('should fetch single blog successfully', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockBlog });

      const { result } = renderHook(() => useBlogStore());

      let blog;
      await act(async () => {
        blog = await result.current.fetchBlog(1);
      });

      expect(blog).toEqual(mockBlog);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Not found'));

      const { result } = renderHook(() => useBlogStore());

      let blog;
      await act(async () => {
        blog = await result.current.fetchBlog(999);
      });

      expect(blog).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Could not load blog. Is the backend running?');
    });
  });

  describe('clearError', () => {
    it('resets error to null when clearError is called', () => {
      // quality: allow-negation-only (null is the store's explicit cleared-error state)
      useBlogStore.setState({ error: 'some error' });

      const { result } = renderHook(() => useBlogStore());

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('selectors', () => {
    it('selectBlogs returns the blogs array from state', () => {
      const state = { ...useBlogStore.getState(), blogs: mockBlogs, loading: false, error: null };
      expect(selectBlogs(state)).toBe(mockBlogs);
    });

    it('selectBlogsLoading returns the loading flag from state', () => {
      const state = { ...useBlogStore.getState(), blogs: [], loading: true, error: null };
      expect(selectBlogsLoading(state)).toBe(true);
    });

    it('selectBlogsError returns the error string from state', () => {
      const state = { ...useBlogStore.getState(), blogs: [], loading: false, error: 'oops' };
      expect(selectBlogsError(state)).toBe('oops');
    });
  });
});
