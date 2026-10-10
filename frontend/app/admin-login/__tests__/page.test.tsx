import { describe, it, expect, beforeEach } from '@jest/globals';
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import AdminLoginPage from '../page';
import { useAuthStore } from '@/lib/stores/authStore';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: { getState: jest.fn() } }));

const replace = jest.fn();
const exchange = jest.fn();
const mockGetState = useAuthStore.getState as jest.Mock;

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('AdminLoginPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ replace });
    mockGetState.mockReturnValue({ exchangeAdminHandoff: exchange });
    window.history.replaceState(null, '', '/admin-login');
  });

  it('rejects the legacy JWT link without attempting a session exchange', async () => {
    window.history.replaceState(null, '', '/admin-login?access=a&refresh=r&redirect=/orders');
    render(<AdminLoginPage />);
    expect(exchange).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de acceso no es válido');
    expect(window.location.search).toBe('?redirect=%2Forders');
  });

  it('removes the sensitive fragment before the exchange finishes', () => {
    window.history.replaceState(null, '', '/admin-login#handoff=signed-proof');
    exchange.mockReturnValue(new Promise(() => {}));
    render(<AdminLoginPage />);
    expect(window.location.hash).toBe('');
    expect(exchange).toHaveBeenCalledWith('signed-proof', expect.any(Function));
    expect(screen.getByText('Iniciando sesión...')).toBeVisible();
  });

  it('navigates home after an accepted handoff', async () => {
    window.history.replaceState(null, '', '/admin-login?redirect=//evil.example#handoff=proof');
    exchange.mockResolvedValue(true);
    render(<AdminLoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('displays rejection without navigating away from the previous session', async () => {
    window.history.replaceState(null, '', '/admin-login#handoff=rejected');
    exchange.mockRejectedValue(new Error('Forbidden'));
    render(<AdminLoginPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de acceso no es válido');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shares a single exchange under StrictMode', async () => {
    const pending = deferred();
    window.history.replaceState(null, '', '/admin-login#handoff=proof');
    exchange.mockReturnValue(pending.promise);
    render(<StrictMode><AdminLoginPage /></StrictMode>);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange.mock.calls[0][1]()).toBe(true);
    await act(async () => { pending.resolve(true); });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('withdraws permission to commit after unmount', async () => {
    const pending = deferred();
    window.history.replaceState(null, '', '/admin-login#handoff=proof');
    exchange.mockReturnValue(pending.promise);
    const view = render(<AdminLoginPage />);
    const canCommit = exchange.mock.calls[0][1];
    view.unmount();
    expect(canCommit()).toBe(false);
    await act(async () => { pending.resolve(false); });
    expect(replace).not.toHaveBeenCalled();
  });

  it('stays on the page when the session changed during exchange', async () => {
    window.history.replaceState(null, '', '/admin-login#handoff=proof');
    exchange.mockResolvedValue(false);
    render(<AdminLoginPage />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });
});
