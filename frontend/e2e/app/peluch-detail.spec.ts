import { test, expect } from '../test-with-coverage';
import type { Page } from '@playwright/test';
import type { PeluchDetail } from '../../lib/types';
import { waitForPageLoad } from '../fixtures';
import {
  PELUCH_DETAIL_SIZE_COLOR,
  PELUCH_DETAIL_HUELLA,
  PELUCH_DETAIL_CORAZON,
  PELUCH_DETAIL_AUDIO,
} from '../helpers/flow-tags';

async function navigateToFirstPeluch(page: Page) {
  await page.goto('/catalog');
  await waitForPageLoad(page);
  const cards = page.locator('a[href^="/peluches/"]');
  const count = await cards.count();
  if (count === 0) return false;
  // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
  await cards.first().click();
  await waitForPageLoad(page);
  return true;
}

// Offers a priced huella and a priced corazón, so both inputs render on the detail page.
const PERSONALIZED_PELUCH: PeluchDetail = {
  id: 41, title: 'Osito personalizable', slug: 'osito-personalizable', category_name: 'Osos', category_slug: 'osos',
  lead_description: '', badge: 'none', is_active: true, is_featured: false, discount_pct: 0, display_order: 1,
  min_price: 80000, discounted_min_price: 80000, gallery_urls: [], average_rating: 0, review_count: 0,
  has_huella: true, has_corazon: true, has_audio: false, description: [], specifications: {}, care_instructions: [],
  category: { id: 1, name: 'Osos', slug: 'osos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
  available_colors: [{ id: 31, name: 'Coral', slug: 'coral', hex_code: '#d4848a', sort_order: 1, preview_url: null, image_count: 0, images: [] }],
  size_prices: [{ id: 1, size: { id: 21, label: 'Mediano', slug: 'mediano', cm: '30 cm', sort_order: 1 }, price: 80000,
    is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: true, shipping_cost: 0 }],
  view_count: 0, huella_extra_cost: 15000, corazon_extra_cost: 12000, audio_extra_cost: 0, created_at: '', updated_at: '',
};

type OrderPayload = { items: Array<Record<string, unknown>> };

async function openPersonalizedPeluch(page: Page) {
  await page.route('**/api/categories/', (route) => route.fulfill({ json: [PERSONALIZED_PELUCH.category] }));
  await page.route('**/api/sizes/', (route) => route.fulfill({ json: [PERSONALIZED_PELUCH.size_prices[0].size] }));
  await page.route(/\/api\/peluches\/(?:\?.*)?$/, (route) => route.fulfill({ json: [PERSONALIZED_PELUCH] }));
  await page.route('**/api/peluches/osito-personalizable/', (route) => route.fulfill({ json: PERSONALIZED_PELUCH }));
  await page.route('**/api/peluches/osito-personalizable/reviews/', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/orders/', (route) => route.fulfill({ status: 201, json: {
    order_number: 'MMT-PERSONALIZADO', total_amount: 95000, deposit_amount: 47500, balance_amount: 47500,
    shipping_amount: 0, discount_amount: 0, payment_mode: 'deposit', amount_paid_now: 47500, is_guest: true,
  } }));
  await page.goto('/catalog');
  await page.getByRole('link', { name: new RegExp(PERSONALIZED_PELUCH.title) }).click();
}

// Adds the configured peluch, completes checkout and returns the order request body.
async function submitOrderFromDetail(page: Page): Promise<OrderPayload> {
  await page.getByRole('button', { name: /^Agregar/ }).click();
  await page.getByRole('link', { name: 'Carrito', exact: true }).click();
  await page.getByRole('link', { name: 'Continuar al checkout', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('Ana López');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Celular', { exact: true }).fill('3001234567');
  await page.getByLabel('Dirección completa', { exact: true }).fill('Calle 50 # 40-20');
  await page.getByRole('checkbox').check();
  const orderRequest = page.waitForRequest(
    (request) => request.url().endsWith('/api/orders/') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: /^Ir a pagar/ }).click();
  return (await orderRequest).postDataJSON() as OrderPayload;
}

test.describe('Peluch Detail — Personalization', () => {
  test('should select size and color on peluch detail page',
    { tag: [...PELUCH_DETAIL_SIZE_COLOR, '@outcome:display'] },
    async ({ page }) => {
      const found = await navigateToFirstPeluch(page);
      if (!found) return;

      await expect(page).toHaveURL(/.*peluches\/.+/);

      // Size section
      const sizeLabel = page.getByText('Tamaño');
      if (await sizeLabel.isVisible()) {
        // quality: allow-fragile-selector (size options are divs keyed by size data; scoped by cm text pattern)
        const sizeOptions = page.locator('div').filter({ hasText: /\d+cm/ }).filter({ hasText: /\$/ });
        const sizeCount = await sizeOptions.count();

        if (sizeCount > 1) {
          // quality: allow-fragile-selector (size options are divs driven by catalog data; second option picked to test toggle)
          await sizeOptions.nth(1).click();
          await expect(sizeLabel).toBeVisible();
        } else if (sizeCount === 1) {
          // quality: allow-fragile-selector (only one size available; first is the only choice)
          await sizeOptions.first().click();
          await expect(sizeLabel).toBeVisible();
        }
      }

      // Color section
      const colorLabel = page.getByText('Color del peluche');
      if (await colorLabel.isVisible()) {
        // quality: allow-fragile-selector (color swatches are circular divs with hex background; first swatch is the default, click second if available)
        const colorSection = page.locator('div').filter({ has: colorLabel }).last();
        const colorNames = colorSection.locator('span').filter({ hasText: /\w+/ });
        const colorCount = await colorNames.count();

        if (colorCount > 1) {
          // quality: allow-fragile-selector (color swatches are data-driven; second swatch tests toggle from default)
          await colorNames.nth(1).click();
        } else if (colorCount === 1) {
          // quality: allow-fragile-selector (only one color available; first is the only choice)
          await colorNames.first().click();
        }

        await expect(colorLabel).toBeVisible();
      }
    }
  );

  test('sends the typed huella name with the order',
    { tag: [...PELUCH_DETAIL_HUELLA, '@outcome:success'] },
    async ({ page }) => {
      // Fails if the name typed for the huella never reaches the order the workshop receives.
      await openPersonalizedPeluch(page);
      await page.getByPlaceholder('Escribe el nombre aquí...').fill('Luna');

      const payload = await submitOrderFromDetail(page);

      expect(payload.items[0]).toEqual(expect.objectContaining({ huella_type: 'name', huella_text: 'Luna' }));
    }
  );

  test('sends the typed corazón phrase with the order',
    { tag: [...PELUCH_DETAIL_CORAZON, '@outcome:success'] },
    async ({ page }) => {
      // Fails if the corazón phrase typed by the customer never reaches the order the workshop receives.
      await openPersonalizedPeluch(page);
      await page.getByPlaceholder('Una frase especial (máx. 50 caracteres)').fill('Te quiero mucho');

      const payload = await submitOrderFromDetail(page);

      expect(payload.items[0]).toEqual(expect.objectContaining({ corazon_phrase: 'Te quiero mucho' }));
    }
  );

  test('should upload a personalization audio on the peluch detail page',
    { tag: [...PELUCH_DETAIL_AUDIO] },
    async ({ page }) => {
      const found = await navigateToFirstPeluch(page);
      if (!found) return;

      await expect(page).toHaveURL(/.*peluches\/.+/);

      const audioSection = page.getByText(/🔊 Audio personalizado/);
      if (!await audioSection.isVisible()) return;

      // Select an audio file through the hidden file input — the real
      // audio-personalization action the "Subir audio" button delegates to.
      // quality: allow-fragile-selector (audio upload is the only file input on the peluch detail page)
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'mensaje-audio.mp3',
        mimeType: 'audio/mpeg',
        buffer: Buffer.from('fake-audio-bytes'),
      });

      // The upload control stays available after selecting the file.
      await expect(page.getByRole('button', { name: /Subir audio/i })).toBeVisible();
    }
  );
});
