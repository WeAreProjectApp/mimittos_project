import { test, expect } from '../test-with-coverage';
import type { PeluchDetail } from '../../lib/types';
import { waitForPageLoad } from '../fixtures';
import { PURCHASE_COMPLETE_FLOW, PURCHASE_MULTIPLE_ITEMS, PURCHASE_DISABLED_EMPTY_CART, PURCHASE_LOADING_STATE, HOME_PRODUCT_CAROUSEL } from '../helpers/flow-tags';

// quality: disable too_many_assertions (multi-step purchase flow requires asserting each navigation step)
// quality: disable test_too_long (complete purchase E2E covers full user journey and cannot be split without losing flow context)
test.describe('Complete Purchase Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
    await page.evaluate(() => localStorage.clear());
  });

  test('should complete full purchase flow from home to checkout', { tag: [...PURCHASE_COMPLETE_FLOW, '@outcome:success'] }, async ({ page }) => {
    // Fails if navigation, add-to-cart or checkout loses the selected product.
    const product: PeluchDetail = {
      id: 11, title: 'Oso para compra completa', slug: 'oso-compra-completa', category_name: 'Osos', category_slug: 'osos',
      lead_description: '', badge: 'none', is_active: true, is_featured: true, discount_pct: 0, display_order: 1,
      min_price: 80000, discounted_min_price: 80000, gallery_urls: [], average_rating: 0, review_count: 0,
      has_huella: false, has_corazon: false, has_audio: false, description: [], specifications: {}, care_instructions: [],
      category: { id: 1, name: 'Osos', slug: 'osos', description: '', display_order: 1, is_active: true, is_featured: true, image_url: null },
      available_colors: [{ id: 31, name: 'Coral', slug: 'coral', hex_code: '#d4848a', sort_order: 1, preview_url: null, image_count: 0, images: [] }],
      size_prices: [{ id: 1, size: { id: 21, label: 'Mediano', slug: 'mediano', cm: '30 cm', sort_order: 1 }, price: 80000,
        is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: true, shipping_cost: 0 }],
      view_count: 0, huella_extra_cost: 0, corazon_extra_cost: 0, audio_extra_cost: 0, created_at: '', updated_at: '',
    };
    const responses: Record<string, unknown> = {
      '/api/categories/featured/': [product.category], '/api/categories/': [product.category],
      '/api/peluches/featured/': [product], '/api/peluches/': [product],
      '/api/sizes/': [product.size_prices[0].size], '/api/reviews/home/': [],
      '/api/peluches/oso-compra-completa/': product, '/api/peluches/oso-compra-completa/reviews/': [],
    };
    await page.route('**/api/**', (route) => route.fulfill({ json: responses[new URL(route.request().url()).pathname] ?? {} }));

    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Catálogo', exact: true }).click();
    await page.getByRole('link', { name: new RegExp(product.title) }).click();
    await page.getByRole('button', { name: 'Agregar · $80.000', exact: true }).click();
    await expect(page.getByText('¡Agregado al carrito!')).toBeVisible();
    await page.getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(page.getByTestId('cart-item-11-21-31')).toContainText(product.title);
    await page.getByRole('link', { name: 'Continuar al checkout', exact: true }).click();
    await page.getByLabel('Nombre completo', { exact: true }).fill('Ana López');
    await page.getByLabel('Correo electrónico', { exact: true }).fill('ana@example.com');
    await page.getByLabel('Celular', { exact: true }).fill('3001234567');
    await page.getByLabel('Dirección completa', { exact: true }).fill('Calle 50 # 40-20');
    await page.getByRole('checkbox').check();

    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'Tu pedido', exact: true }).locator('..')).toContainText(product.title);
    await expect(page.getByRole('button', { name: 'Ir a pagar · $40.000', exact: true })).toBeEnabled();
  });

  test('should navigate through product carousel on home page', { tag: [...HOME_PRODUCT_CAROUSEL, '@outcome:success'] }, async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // quality: allow-fragile-selector (carousel peluches uniquely scoped by href pattern)
    const carouselPeluches = page.locator('a[href^="/peluches/"]');
    const count = await carouselPeluches.count();

    if (count > 0) {
      // quality: allow-fragile-selector (carousel peluches uniquely scoped by href pattern)
      await carouselPeluches.first().click();
      await waitForPageLoad(page);
      await expect(page).toHaveURL(/.*peluches\/.+/);
      await expect(page.getByRole('button', { name: /Agregar/i })).toBeVisible();
    }
  });

  test('should handle multiple peluches in cart during checkout', { tag: [...PURCHASE_MULTIPLE_ITEMS] }, async ({ page }) => {
    await page.goto('/catalog');
    await waitForPageLoad(page);

    // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
    const peluchCards = page.locator('a[href^="/peluches/"]');
    const count = await peluchCards.count();

    if (count >= 2) {
      // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
      await peluchCards.nth(0).click();
      await waitForPageLoad(page);
      const addBtn0 = page.getByRole('button', { name: /Agregar/i });
      if (await addBtn0.isVisible()) { await addBtn0.click(); await page.waitForLoadState('domcontentloaded'); }

      await page.goto('/catalog');
      await waitForPageLoad(page);

      // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
      await peluchCards.nth(1).click();
      await waitForPageLoad(page);
      const addBtn1 = page.getByRole('button', { name: /Agregar/i });
      if (await addBtn1.isVisible()) { await addBtn1.click(); await page.waitForLoadState('domcontentloaded'); }

      await page.goto('/checkout');
      await waitForPageLoad(page);

      await expect(page.locator('text=Subtotal')).toBeVisible();

      const termsCheckbox = page.locator('input[type="checkbox"]');
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.click();
      }

      const submitBtn = page.locator('button[type="submit"]');
      await expect(submitBtn).toBeEnabled();
    }
  });

  test('should disable checkout button when cart is empty', { tag: [...PURCHASE_DISABLED_EMPTY_CART, '@outcome:display'] }, async ({ page }) => {
    await page.goto('/checkout');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitForPageLoad(page);

    // Fill terms
    const termsCheckbox = page.locator('input[type="checkbox"]');
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.click();
    }

    // Submit button should be disabled (cart is empty)
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();
  });

  test('recovers checkout after a rejected pending submission', { tag: [...PURCHASE_LOADING_STATE, '@outcome:display', '@outcome:failure'] }, async ({ page }) => {
    // Fails if a pending HTTP request does not lock submit or a rejection leaves checkout unusable.
    const product: PeluchDetail = {
      id: 11, title: 'Oso para checkout', slug: 'oso-checkout', category_name: 'Osos', category_slug: 'osos',
      lead_description: '', badge: 'none', is_active: true, is_featured: false, discount_pct: 0, display_order: 1,
      min_price: 80000, discounted_min_price: 80000, gallery_urls: [], average_rating: 0, review_count: 0,
      has_huella: false, has_corazon: false, has_audio: false, description: [], specifications: {}, care_instructions: [],
      category: { id: 1, name: 'Osos', slug: 'osos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
      available_colors: [{ id: 31, name: 'Coral', slug: 'coral', hex_code: '#d4848a', sort_order: 1, preview_url: null, image_count: 0, images: [] }],
      size_prices: [{ id: 1, size: { id: 21, label: 'Mediano', slug: 'mediano', cm: '30 cm', sort_order: 1 }, price: 80000,
        is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: true, shipping_cost: 0 }],
      view_count: 0, huella_extra_cost: 0, corazon_extra_cost: 0, audio_extra_cost: 0, created_at: '', updated_at: '',
    };
    await page.route('**/api/categories/', (route) => route.fulfill({ json: [product.category] }));
    await page.route('**/api/sizes/', (route) => route.fulfill({ json: [product.size_prices[0].size] }));
    await page.route(/\/api\/peluches\/(?:\?.*)?$/, (route) => route.fulfill({ json: [product] }));
    await page.route('**/api/peluches/oso-checkout/', (route) => route.fulfill({ json: product }));
    await page.route('**/api/peluches/oso-checkout/reviews/', (route) => route.fulfill({ json: [] }));
    await page.goto('/catalog');
    await page.getByRole('link', { name: new RegExp(product.title) }).click();
    await page.getByRole('button', { name: /^Agregar/ }).click();
    await expect(page.getByText('¡Agregado al carrito!')).toBeVisible();
    await page.goto('/checkout');
    await page.getByLabel('Nombre completo', { exact: true }).fill('Ana López');
    await page.getByLabel('Correo electrónico', { exact: true }).fill('ana@example.com');
    await page.getByLabel('Celular', { exact: true }).fill('3001234567');
    await page.getByLabel('Dirección completa', { exact: true }).fill('Calle 50 # 40-20');
    await page.getByRole('checkbox').check();

    let releaseResponse!: () => void;
    const heldResponse = new Promise<void>((resolve) => { releaseResponse = resolve; });
    let requests = 0;
    await page.route('**/api/orders/', async (route) => {
      requests += 1;
      await heldResponse;
      await route.fulfill({ status: 502, json: { detail: 'No pudimos procesar el pedido. Intenta de nuevo.' } });
    });
    const submitted = page.waitForRequest((request) => request.url().endsWith('/api/orders/') && request.method() === 'POST');
    await page.getByRole('button', { name: /^Ir a pagar/ }).click();
    await submitted;

    try {
      await expect(page.getByRole('button', { name: 'Procesando...', exact: true })).toBeDisabled();
      expect(requests).toBe(1);
    } finally {
      releaseResponse();
    }
    await expect(page.getByText('No pudimos procesar el pedido. Intenta de nuevo.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Ir a pagar/ })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Tu pedido', exact: true }).locator('..')).toContainText(product.title);
    const retried = page.waitForRequest((request) => request.url().endsWith('/api/orders/') && request.method() === 'POST');
    await page.getByRole('button', { name: /^Ir a pagar/ }).click();
    await retried;
    await expect(page.getByText('No pudimos procesar el pedido. Intenta de nuevo.', { exact: true })).toBeVisible();
    expect(requests).toBe(2);
  });
});
