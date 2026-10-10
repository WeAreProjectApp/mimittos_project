import { test, expect } from '../test-with-coverage';
import { waitForPageLoad } from '../fixtures';
import { AUTH_SIGN_IN_FORM, AUTH_SIGN_UP_FORM, AUTH_LOGIN_INVALID, AUTH_PROTECTED_REDIRECT, AUTH_FORGOT_PASSWORD_FORM } from '../helpers/flow-tags';

test.describe('Authentication', () => {
  test('should show validation on empty form submission', { tag: [...AUTH_SIGN_IN_FORM, '@outcome:display'] }, async ({ page }) => {
    await page.goto('/sign-in');
    await waitForPageLoad(page);

    // Try to submit empty form
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Should still be on sign-in page
    await expect(page).toHaveURL(/.*sign-in/);
  });

  test('should accept input in form fields', { tag: [...AUTH_SIGN_IN_FORM, '@outcome:display'] }, async ({ page }) => {
    await page.goto('/sign-in');
    await waitForPageLoad(page);

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('password123');
    await expect(passwordInput).toHaveValue('password123');
  });

  test('should handle invalid credentials gracefully', { tag: [...AUTH_LOGIN_INVALID, '@outcome:error'] }, async ({ page }) => {
    // Force a deterministic 401 from the auth endpoint, independent of CI seed data.
    // This isolates the test to the FRONTEND error-handling path: signIn rejects,
    // catch block runs, setError fires, page does NOT navigate.
    await page.route('**/sign_in/', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Correo o contraseña incorrectos' }),
      });
    });

    await page.goto('/sign-in');
    await waitForPageLoad(page);

    await page.locator('input[type="email"]').fill('invalid@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText(/Correo o contraseña incorrectos|completa el captcha/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/.*sign-in/);
  });

  // Estos dos tests verifican el guard `useRequireAuth` de punta a punta: que la
  // ruta protegida NO se sirva a un visitante sin sesión. La lógica del hook ya
  // tiene su unit test (lib/hooks/__tests__/useRequireAuth.test.ts, que asserta
  // replace('/sign-in')); acá se verifica el hecho observable en el browser.
  //
  // Antes apuntaban a /dashboard —una ruta que nunca existió en este proyecto—
  // y aseveraban toHaveURL(/dashboard|sign-in/): como la alternación incluía el
  // propio path navegado, pasaban redirigiera o no. La aserción de abajo es
  // deterministica a propósito.
  test('unauthenticated visit to /orders lands on sign-in', { tag: [...AUTH_PROTECTED_REDIRECT, '@outcome:display'] }, async ({ page }) => {
    // quality: allow-no-interaction (guard de ruta protegida: entrar sin sesión ES el disparador, no hay acción de usuario que ejecutar)
    // quality: allow-deep-link (el deep link es el comportamiento bajo prueba: se verifica que la URL protegida no se sirva directo)
    await page.goto('/orders');
    await waitForPageLoad(page);

    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('unauthenticated visit to /backoffice lands on sign-in', { tag: [...AUTH_PROTECTED_REDIRECT, '@outcome:display'] }, async ({ page }) => {
    // quality: allow-no-interaction (guard de ruta protegida: entrar sin sesión ES el disparador, no hay acción de usuario que ejecutar)
    // quality: allow-deep-link (el deep link es el comportamiento bajo prueba: se verifica que la URL protegida no se sirva directo)
    await page.goto('/backoffice');
    await waitForPageLoad(page);

    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('should validate password mismatch on sign-up', { tag: [...AUTH_SIGN_UP_FORM, '@outcome:error'] }, async ({ page }) => {
    await page.goto('/sign-up');
    await waitForPageLoad(page);

    await page.getByPlaceholder('Sofía').fill('Test');
    await page.getByPlaceholder('Martínez').fill('User');
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('password123');
    await page.getByPlaceholder('Repite la contraseña').fill('different456');

    await page.getByRole('button', { name: /Crear mi cuenta/i }).click();

    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
    await expect(page).toHaveURL(/.*sign-up/);
  });

  test('should navigate from sign-in to forgot password', { tag: [...AUTH_FORGOT_PASSWORD_FORM, '@outcome:display'] }, async ({ page }) => {
    await page.goto('/sign-in');
    await waitForPageLoad(page);

    const forgotLink = page.getByRole('link', { name: /Olvidaste tu contraseña/i });
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    await page.waitForURL(/.*forgot-password/, { timeout: 10_000 });

    await expect(page).toHaveURL(/.*forgot-password/);
    await expect(page.getByRole('heading', { name: /Olvidaste tu contraseña/i })).toBeVisible();
  });

  test('should show verification step after successful registration', { tag: [...AUTH_SIGN_UP_FORM, '@outcome:display'] }, async ({ page }) => {
    await page.route('**/api/sign_up/', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'ana@test.com' }),
      })
    );

    await page.goto('/sign-up');
    await waitForPageLoad(page);

    await page.getByPlaceholder('Sofía').fill('Ana');
    await page.getByPlaceholder('Martínez').fill('García');
    await page.locator('input[type="email"]').fill('ana@test.com');
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('password123');
    await page.getByPlaceholder('Repite la contraseña').fill('password123');

    // quality: allow-fragile-selector (terms checkbox sibling div, uniquely scoped by adjacent text span)
    await page.locator('span', { hasText: 'Acepto los' }).locator('..').locator('div').first().click();

    await page.getByRole('button', { name: /Crear mi cuenta/i }).click();

    // After successful submission the app transitions to the email verification step
    await expect(page.getByPlaceholder('000000')).toBeVisible({ timeout: 10_000 });
  });

  test('registration recovers from an unconfirmed email delivery', { tag: [...AUTH_SIGN_UP_FORM, '@outcome:failure'] }, async ({ page }) => {
    const deliveryError = 'No pudimos confirmar el envío del código. Tu cuenta sigue pendiente de verificación. Espera al menos un minuto antes de volver a intentarlo.';
    const limitError = 'Has alcanzado el límite de intentos o envíos. Inténtalo de nuevo más tarde.';
    const signUpRequests: unknown[] = [];
    await page.clock.install();
    await page.route('**/api/google-captcha/site-key/', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ site_key: null }) })
    );
    await page.route('**/api/sign_up/', (route) => {
      signUpRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: deliveryError }) });
    });

    await page.goto('/sign-up');
    await waitForPageLoad(page);
    await page.getByPlaceholder('Sofía').fill('Ana');
    await page.getByPlaceholder('Martínez').fill('García');
    await page.getByPlaceholder('sofia@ejemplo.com').fill('delivery@example.com');
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('OwnerPassword123!');
    await page.getByPlaceholder('Repite la contraseña').fill('OwnerPassword123!');
    await page.getByTestId('signup-terms-toggle').click();
    const submit = page.getByRole('button', { name: /Crear mi cuenta/i });

    await submit.click();

    await expect(page.getByText(deliveryError, { exact: true })).toBeVisible();
    await expect(page.getByTestId('registration-code-input')).toHaveCount(0);
    await expect(page.getByPlaceholder('sofia@ejemplo.com')).toHaveValue('delivery@example.com');
    await expect(submit).toBeEnabled();
    expect(signUpRequests).toHaveLength(1);

    await page.unroute('**/api/sign_up/');
    await page.route('**/api/sign_up/', (route) => {
      signUpRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: limitError }) });
    });
    await submit.click();
    await expect(page.getByText(limitError, { exact: true })).toBeVisible();
    await expect(page.getByTestId('registration-code-input')).toHaveCount(0);
    expect(signUpRequests).toHaveLength(2);

    // The API boundary represents recovery after its unchanged 60-second limit;
    // server-side budget enforcement is exercised by the isolated backend tests.
    await page.clock.runFor(60_000);
    await page.unroute('**/api/sign_up/');
    await page.route('**/api/sign_up/', (route) => {
      signUpRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'delivery@example.com' }) });
    });
    await submit.click();

    await expect(page.getByTestId('registration-code-input')).toBeVisible();
    await expect(page.getByText(deliveryError, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Reenviar en 60s', { exact: true })).toBeVisible();
    expect(signUpRequests).toHaveLength(3);
  });
});
