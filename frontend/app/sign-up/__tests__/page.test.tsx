import { describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SignUpPage from '../page';
import { useAuthStore } from '../../../lib/stores/authStore';
import { useRouter } from 'next/navigation';

jest.mock('react-google-recaptcha', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const MockRecaptcha = React.forwardRef(
    ({ onChange: _onChange }: { onChange?: (token: string | null) => void }, ref: any) => {
      React.useImperativeHandle(ref, () => ({ reset: () => {} }));
      return <div data-testid="mock-recaptcha" />;
    },
  );
  MockRecaptcha.displayName = 'MockRecaptcha';
  return MockRecaptcha;
});

jest.mock('../../../lib/services/http', () => ({
  api: { get: jest.fn().mockRejectedValue(new Error('no key')), post: jest.fn() },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => ({ get: () => null })),
}));

jest.mock('../../../lib/stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockUseRouter = useRouter as unknown as jest.Mock;

const setAuthStoreState = (state: any) => {
  mockUseAuthStore.mockImplementation((selector?: (store: any) => unknown) =>
    selector ? selector(state) : state
  );
};

const acceptTerms = () => {
  const termsCheckbox = screen.getByText(/Términos y Condiciones/i).closest('label')!.firstElementChild as HTMLElement;
  fireEvent.click(termsCheckbox);
};

describe('SignUpPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows error when passwords do not match', async () => {
    // quality: allow-mock-only (client validation must block sign-up when passwords differ)
    const signUp = jest.fn();
    setAuthStoreState({ signUp });
    mockUseRouter.mockReturnValue({ replace: jest.fn() });

    render(<SignUpPage />);

    fireEvent.change(screen.getByPlaceholderText('Sofía'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByPlaceholderText('Martínez'), { target: { value: 'User' } });
    fireEvent.change(screen.getByPlaceholderText('sofia@ejemplo.com'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'password456' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear mi cuenta/i }));

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    // quality: allow-mock-only (client validation must block sign-up when the password is too short)
    const signUp = jest.fn();
    setAuthStoreState({ signUp });
    mockUseRouter.mockReturnValue({ replace: jest.fn() });

    render(<SignUpPage />);

    fireEvent.change(screen.getByPlaceholderText('sofia@ejemplo.com'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear mi cuenta/i }));

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('verifies registration with the password chosen in the form', async () => {
    const signUp = jest.fn().mockResolvedValue({ email: 'user@example.com' });
    const verifyRegistration = jest.fn().mockResolvedValue(undefined);
    setAuthStoreState({ signUp, verifyRegistration, resendVerification: jest.fn() });
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace });

    render(<SignUpPage />);

    fireEvent.change(screen.getByPlaceholderText('Sofía'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByPlaceholderText('Martínez'), { target: { value: 'User' } });
    fireEvent.change(screen.getByPlaceholderText('sofia@ejemplo.com'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'password123' } });
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /Crear mi cuenta/i }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
        first_name: 'Test',
        last_name: 'User',
        captcha_token: undefined,
      });
    });

    expect(await screen.findByPlaceholderText('000000')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Activar mi cuenta/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/orders'));
    expect(verifyRegistration).toHaveBeenCalledWith({
      email: 'user@example.com', code: '123456', new_password: 'password123',
    });
  });

  it('shows an error when sign up fails', async () => {
    const signUp = jest.fn().mockRejectedValue({ response: { data: { error: 'Registration failed' } } });
    setAuthStoreState({ signUp });
    mockUseRouter.mockReturnValue({ replace: jest.fn() });

    render(<SignUpPage />);

    fireEvent.change(screen.getByPlaceholderText('sofia@ejemplo.com'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'password123' } });
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /Crear mi cuenta/i }));

    expect(await screen.findByText('Registration failed')).toBeInTheDocument();
  });

  it('shows default error when sign up error payload is missing', async () => {
    const signUp = jest.fn().mockRejectedValue({ response: { data: null } });
    setAuthStoreState({ signUp });
    mockUseRouter.mockReturnValue({ replace: jest.fn() });

    render(<SignUpPage />);

    fireEvent.change(screen.getByPlaceholderText('sofia@ejemplo.com'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repite la contraseña'), { target: { value: 'password123' } });
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /Crear mi cuenta/i }));

    expect(await screen.findByText('Error al crear la cuenta')).toBeInTheDocument();
  });
});
