import { test, expect } from '../test-with-coverage';
import type { Page, Route } from '@playwright/test';
import { REVIEW_SUBMIT } from '../helpers/flow-tags';

const TEST_SLUG = 'test-peluch';
const review = {
  id: 1, is_mine: false, user_name: 'Ana', rating: 5,
  comment: 'Un recuerdo muy especial', created_at: '2026-10-08T12:00:00Z',
};
const mockUser = {
  id: 1, email: 'test@example.com', first_name: 'Test', last_name: 'User',
  role: 'customer', is_staff: false,
};
const mockPeluch = {
  id: 1, slug: TEST_SLUG, title: 'Peluche de Prueba',
  description: ['Un peluche de prueba'], lead_description: 'Hecho a mano',
  category_name: 'Clásicos', category_slug: 'clasicos', badge: 'none',
  is_active: true, is_featured: false, discount_pct: 0,
  size_prices: [{
    id: 1, size: { id: 1, label: 'Mediano', slug: 'mediano', cm: '30cm', sort_order: 1 },
    price: 150000, is_available: true, deposit_percentage: 50,
    full_payment_discount_pct: 0, free_shipping: true, shipping_cost: 0,
  }],
  available_colors: [{
    id: 1, name: 'Rosado', slug: 'rosado', hex_code: '#F4A7B9',
    sort_order: 1, preview_url: null, image_count: 0, images: [],
  }],
  has_huella: false, has_corazon: false, has_audio: false,
  gallery_urls: [], specifications: {}, care_instructions: [],
  average_rating: 5, review_count: 1, min_price: 150000,
};

async function setupAuth(page: Page) {
  await page.addInitScript(() => {
    document.cookie = 'access_token=mock-access-token; path=/';
    document.cookie = 'refresh_token=mock-refresh-token; path=/';
  });
  await page.route('**/api/validate_token/', (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ valid: true, user: mockUser }),
  }));
}

async function setupProduct(page: Page, isMine: boolean) {
  await page.route('**/api/categories/', (route: Route) => route.fulfill({
    json: [{
      id: 1, name: 'Clásicos', slug: 'clasicos', description: '',
      display_order: 1, is_active: true, is_featured: false, image_url: null,
    }],
  }));
  await page.route('**/api/sizes/', (route: Route) => route.fulfill({
    json: [mockPeluch.size_prices[0].size],
  }));
  await page.route(/\/api\/peluches\/(?:\?.*)?$/, (route: Route) => route.fulfill({
    json: [mockPeluch],
  }));
  await page.route(`**/api/peluches/${TEST_SLUG}/`, (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(mockPeluch),
  }));
  await page.route(`**/api/peluches/${TEST_SLUG}/reviews/`, (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ ...review, is_mine: isMine }]),
  }));
}

test('an owned review hides the submission form',
  { tag: [...REVIEW_SUBMIT, '@outcome:display'] },
  async ({ page }) => {
    await setupAuth(page);
    await setupProduct(page, true);

    await page.goto('/catalog');
    await page.getByRole('link', { name: /Peluche de Prueba/ }).click();
    await expect(page).toHaveURL(`/peluches/${TEST_SLUG}`);

    await expect(page.getByText('Un recuerdo muy especial')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar reseña' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Deja tu reseña' })).toHaveCount(0);
  },
);

test('a guest can read public reviews',
  { tag: [...REVIEW_SUBMIT, '@outcome:display'] },
  async ({ page }) => {
    await setupProduct(page, false);

    await page.goto('/catalog');
    await page.getByRole('link', { name: /Peluche de Prueba/ }).click();
    await expect(page).toHaveURL(`/peluches/${TEST_SLUG}`);

    await expect(page.getByText('Un recuerdo muy especial')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar reseña' })).toHaveCount(0);
  },
);

test('another buyer can submit a review using the ownership flag',
  { tag: [...REVIEW_SUBMIT, '@outcome:success'] },
  async ({ page }) => {
    await setupAuth(page);
    await setupProduct(page, false);
    await page.goto('/catalog');
    await page.getByRole('link', { name: /Peluche de Prueba/ }).click();
    await expect(page).toHaveURL(`/peluches/${TEST_SLUG}`);
    await expect(page.getByText('Un recuerdo muy especial')).toBeVisible();
    await page.route(`**/api/peluches/${TEST_SLUG}/reviews/`, (route: Route) => route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ ...review, id: 2, is_mine: true }),
    }));

    await page.getByRole('button', { name: '5 estrellas', exact: true }).click();
    await page.getByRole('textbox').fill('Excelente peluche, muy bien hecho');
    const submission = page.waitForRequest((request) =>
      request.url().endsWith(`/peluches/${TEST_SLUG}/reviews/`) && request.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Publicar reseña' }).click();

    expect((await submission).postDataJSON()).toEqual({
      rating: 5, comment: 'Excelente peluche, muy bien hecho',
    });
    await expect(page.getByText('¡Gracias por tu reseña!')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar reseña' })).toHaveCount(0);
  },
);
