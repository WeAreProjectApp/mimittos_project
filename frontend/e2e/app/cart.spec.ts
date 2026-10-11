import type { Page } from '@playwright/test';
import type { PeluchDetail } from '../../lib/types';
import { test, expect } from '../test-with-coverage';
import { CART_ADD, CART_EMPTY, CART_UPDATE_QTY, CART_REMOVE, CART_SUBTOTAL, CART_PERSIST, CART_MULTIPLE_PRODUCTS } from '../helpers/flow-tags';

const CATEGORY = { id: 1, name: 'Osos', slug: 'osos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null };
const SIZE = { id: 21, label: 'Mediano', slug: 'mediano', cm: '30 cm', sort_order: 1 };
const COLOR = { id: 31, name: 'Coral', slug: 'coral', hex_code: '#d4848a', sort_order: 1, preview_url: null, image_count: 0, images: [] };

function peluch(id: number, title: string, slug: string, price: number): PeluchDetail {
  return {
    id, title, slug, category_name: CATEGORY.name, category_slug: CATEGORY.slug,
    lead_description: '', badge: 'none', is_active: true, is_featured: false,
    discount_pct: 0, display_order: id, min_price: price, discounted_min_price: price,
    available_colors: [COLOR], gallery_urls: [], average_rating: 0, review_count: 0,
    has_huella: false, has_corazon: false, has_audio: false, category: CATEGORY,
    description: [], specifications: {}, care_instructions: [], view_count: 0,
    huella_extra_cost: 0, corazon_extra_cost: 0, audio_extra_cost: 0,
    created_at: '', updated_at: '',
    size_prices: [{ id, size: SIZE, price, is_available: true, deposit_percentage: 50,
      full_payment_discount_pct: 0, free_shipping: true, shipping_cost: 0 }],
  };
}

const BEAR = peluch(11, 'Oso Coral de prueba', 'oso-coral-prueba', 80000);
const RABBIT = peluch(12, 'Conejo Coral de prueba', 'conejo-coral-prueba', 60000);

async function mockCatalog(page: Page) {
  await page.route('**/api/categories/', (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route('**/api/sizes/', (route) => route.fulfill({ json: [SIZE] }));
  await page.route(/\/api\/peluches\/(?:\?.*)?$/, (route) => route.fulfill({ json: [BEAR, RABBIT] }));
  for (const product of [BEAR, RABBIT]) {
    await page.route('**/api/peluches/' + product.slug + '/', (route) => route.fulfill({ json: product }));
    await page.route('**/api/peluches/' + product.slug + '/reviews/', (route) => route.fulfill({ json: [] }));
  }
}

async function addProduct(page: Page, product: PeluchDetail) {
  await page.goto('/catalog');
  await page.getByRole('link', { name: new RegExp(product.title) }).click();
  await expect(page.getByRole('heading', { name: product.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Agregar/ }).click();
  await expect(page.getByText('¡Agregado al carrito!')).toBeVisible();
}

function cartLine(page: Page, product: PeluchDetail) {
  return page.getByTestId(`cart-item-${product.id}-${SIZE.id}-${COLOR.id}`);
}

function subtotal(page: Page) {
  return page.getByText('Subtotal productos', { exact: true }).locator('..');
}

test.describe('Shopping Cart', () => {
  test.beforeEach(async ({ page }) => {
    await mockCatalog(page);
    await page.goto('/cart');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByText('Tu carrito está vacío', { exact: true })).toBeVisible();
  });

  test('adds the selected product to the cart', { tag: [...CART_ADD, '@outcome:success'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');

    await expect(cartLine(page, BEAR)).toContainText('Mediano');
    await expect(cartLine(page, BEAR)).toContainText('Coral');
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(1);
    await expect(page.getByText('Tu carrito está vacío', { exact: true })).toBeHidden();
  });

  test('shows the empty cart message', { tag: [...CART_EMPTY, '@outcome:display'] }, async ({ page }) => {
    // quality: allow-no-interaction (fresh empty-cart display is asserted after the shared storage reset).
    await expect(page.getByText('Tu carrito está vacío', { exact: true })).toHaveText('Tu carrito está vacío');
    await expect(page.getByRole('link', { name: 'Ver catálogo', exact: true })).toBeVisible();
  });

  test('updates quantity through the increment control', { tag: [...CART_UPDATE_QTY, '@outcome:success'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');
    const line = cartLine(page, BEAR);
    const quantity = line.getByRole('button', { name: '+', exact: true }).locator('..');

    await line.getByRole('button', { name: '+', exact: true }).click();
    await line.getByRole('button', { name: '+', exact: true }).click();

    await expect(quantity.getByText('3', { exact: true })).toHaveText('3');
    await expect(subtotal(page)).toHaveText('Subtotal productos$240.000');
  });

  test('removes the last product explicitly', { tag: [...CART_REMOVE, '@outcome:success'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');

    await cartLine(page, BEAR).getByRole('button', { name: 'Eliminar', exact: true }).click();

    await expect(page.getByText('Tu carrito está vacío', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: BEAR.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continuar al checkout', exact: true })).toHaveCount(0);
  });

  test('shows the exact product subtotal', { tag: [...CART_SUBTOTAL, '@outcome:display'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');

    await expect(subtotal(page)).toHaveText('Subtotal productos$80.000');
  });

  test('persists the updated quantity across a reload', { tag: [...CART_PERSIST, '@outcome:display'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');
    await cartLine(page, BEAR).getByRole('button', { name: '+', exact: true }).click();
    await expect(subtotal(page)).toHaveText('Subtotal productos$160.000');

    await page.reload();

    const quantity = cartLine(page, BEAR).getByRole('button', { name: '+', exact: true }).locator('..');
    await expect(quantity.getByText('2', { exact: true })).toHaveText('2');
    await expect(subtotal(page)).toHaveText('Subtotal productos$160.000');
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(1);
  });

  test('keeps quantity at one when decremented', { tag: [...CART_UPDATE_QTY, '@outcome:success'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');
    const line = cartLine(page, BEAR);

    await line.getByRole('button', { name: '−', exact: true }).click();

    const quantity = line.getByRole('button', { name: '−', exact: true }).locator('..');
    await expect(quantity.getByText('1', { exact: true })).toHaveText('1');
    await expect(line.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
    await expect(subtotal(page)).toHaveText('Subtotal productos$80.000');
  });

  test('decrements quantity through the decrement control', { tag: [...CART_UPDATE_QTY, '@outcome:success'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await page.goto('/cart');
    const line = cartLine(page, BEAR);
    await line.getByRole('button', { name: '+', exact: true }).click();
    await expect(subtotal(page)).toHaveText('Subtotal productos$160.000');

    await line.getByRole('button', { name: '−', exact: true }).click();

    const quantity = line.getByRole('button', { name: '−', exact: true }).locator('..');
    await expect(quantity.getByText('1', { exact: true })).toHaveText('1');
    await expect(subtotal(page)).toHaveText('Subtotal productos$80.000');
  });

  test('keeps exactly two different products in the cart', { tag: [...CART_MULTIPLE_PRODUCTS, '@outcome:success'] }, async ({ page }) => {
    await addProduct(page, BEAR);
    await addProduct(page, RABBIT);
    await page.goto('/cart');

    await expect(page.getByRole('main').getByRole('heading', { level: 3, name: /^(Oso Coral de prueba|Conejo Coral de prueba)$/ })).toHaveText([BEAR.title, RABBIT.title]);
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(2);
    await expect(subtotal(page)).toHaveText('Subtotal productos$140.000');
  });
});


async function addNamedSiblings(page: Page) {
  const product = { ...BEAR, has_huella: true, has_corazon: true, huella_extra_cost: 15000, corazon_extra_cost: 12000 }
  await mockCatalog(page)
  await page.route('**/api/peluches/oso-coral-prueba/', route => route.fulfill({ json: product }))
  await page.goto('/catalog')
  await page.getByRole('link', { name: new RegExp(product.title) }).click()
  await page.getByPlaceholder('Escribe el nombre aquí...').fill('Luna')
  await page.getByPlaceholder('Una frase especial (máx. 50 caracteres)').fill('Para Luna')
  await page.getByRole('button', { name: /^Agregar/ }).click()
  await expect(page.getByText('¡Agregado al carrito!')).toHaveText('¡Agregado al carrito!')
  await page.getByPlaceholder('Escribe el nombre aquí...').fill('Sol')
  await page.getByPlaceholder('Una frase especial (máx. 50 caracteres)').fill('Para Sol')
  await page.getByRole('button', { name: /^Agregar/ }).click()
  await page.getByRole('link', { name: 'Carrito', exact: true }).click()
  const luna = page.getByRole('group', { name: `${product.title} Nombre: Luna · Corazón: Para Luna`, exact: true })
  const sol = page.getByRole('group', { name: `${product.title} Nombre: Sol · Corazón: Para Sol`, exact: true })
  await expect(page.getByTestId('cart-item-11-21-31')).toHaveCount(2)
  return { luna, sol }
}

// Catches a quantity control changing both named siblings of one SKU.
test('changes only the selected sibling quantity', { tag: [...CART_UPDATE_QTY, '@outcome:success'] }, async ({ page }) => {
  const { luna, sol } = await addNamedSiblings(page)
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!).state.items)
  await sol.getByRole('button', { name: '+', exact: true }).click()

  await expect(sol.getByRole('button', { name: '+', exact: true }).locator('..').getByText('2', { exact: true })).toHaveText('2')
  await expect(luna.getByRole('button', { name: '+', exact: true }).locator('..').getByText('1', { exact: true })).toHaveText('1')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!).state.items)).toEqual([original[0], { ...original[1], quantity: 2 }])
})

// Catches hydration changing identities or personalized quantities on the next reload.
test('keeps sibling identities after two cart reloads', { tag: [...CART_PERSIST, '@outcome:display'] }, async ({ page }) => {
  const { luna, sol } = await addNamedSiblings(page)
  await sol.getByRole('button', { name: '+', exact: true }).click()
  await expect(sol.getByRole('button', { name: '+', exact: true }).locator('..').getByText('2', { exact: true })).toHaveText('2')
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!))
  expect(original.state.items.map((line: { cart_line_id: string }) => line.cart_line_id)).toEqual([
    expect.stringMatching(/^cl_[0-9a-f-]{36}$/), expect.stringMatching(/^cl_[0-9a-f-]{36}$/),
  ])
  expect(original.state.items[0].cart_line_id).not.toBe(original.state.items[1].cart_line_id)
  await page.reload()

  await expect(sol).toContainText('Nombre: Sol')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!))).toEqual(original)
  await page.reload()
  await expect(luna).toContainText('Nombre: Luna')
  await expect(sol.getByRole('button', { name: '+', exact: true }).locator('..').getByText('2', { exact: true })).toHaveText('2')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!))).toEqual(original)
})

// Catches deleting one personalized peluch also deleting its same-SKU sibling.
test('removes only the selected sibling', { tag: [...CART_REMOVE, '@outcome:success'] }, async ({ page }) => {
  const { luna, sol } = await addNamedSiblings(page)
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!).state.items)
  await luna.getByRole('button', { name: 'Eliminar', exact: true }).click()

  await expect(luna).toHaveCount(0)
  await expect(sol).toContainText('Corazón: Para Sol')
  await expect(subtotal(page)).toHaveText('Subtotal productos$107.000')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart')!).state.items)).toEqual([original[1]])
})
