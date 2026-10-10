import { test, expect } from '../test-with-coverage';
import type { Page, Route } from '@playwright/test';
import { waitForPageLoad } from '../fixtures';
import {
  BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD,
  BACKOFFICE_PELUCH_COLOR_UPLOAD_PER_IMAGE_STATUS,
  BACKOFFICE_PELUCH_CREATE_CANCEL_DISCARDS_DRAFT,
  BACKOFFICE_PELUCH_EDIT,
} from '../helpers/flow-tags';

/**
 * The draft lifecycle on /backoffice/peluches/nuevo (components/admin/PeluchForm.tsx).
 *
 * Uploading the first colour photo silently POSTs a DRAFT peluch with
 * `is_active: false` (`resolveUploadSlug`, PeluchForm.tsx:155-178) so the image
 * has something to attach to. That draft is real catalogue data created by a
 * side effect, which is why these three flows matter: it must be created only
 * when the form is complete, each image must report its own outcome, and
 * abandoning the form must not leave the draft behind.
 *
 * Every test drives the real widget chain — pick a colour chip, click "+ Foto",
 * hand the file chooser a real PNG — because the draft POST only happens as a
 * consequence of that chain.
 */

const mockAdmin = {
  id: 99, email: 'admin@example.com', first_name: 'Admin', last_name: 'User',
  role: 'admin', is_staff: true,
};

const CATEGORIES = [{ id: 1, name: 'Clásicos', slug: 'clasicos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null }];
const COLORS = [{ id: 7, name: 'Rojo', slug: 'rojo', hex_code: '#ff0000' }];

const DRAFT_SLUG = 'osito-de-prueba';

// A 1x1 PNG: small enough to stay fast, real enough for the client-side
// compression step to decode instead of throwing.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Captured = { createBodies: unknown[]; patchBodies: Record<string, unknown>[]; deleted: string[]; uploaded: number };

async function setupStaffAuth(page: Page) {
  await page.route('**/api/validate_token/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, user: mockAdmin }) })
  );
  await page.route('**/api/token/refresh/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'fake-admin-access' }) })
  );
  await page.context().addCookies([
    { name: 'access_token', value: 'fake-admin-access', domain: 'localhost', path: '/' },
    { name: 'refresh_token', value: 'fake-admin-refresh', domain: 'localhost', path: '/' },
  ]);
}

/**
 * Wires the form's dependencies. `createStatus` / `uploadStatus` let a test pick
 * which leg of the chain fails, which is what separates the error class (the
 * form refuses before any request) from the failure class (the request was made
 * and the backend rejected it).
 */
async function setupForm(
  page: Page,
  opts: { createStatus?: number; uploadStatus?: number; reopenDraft?: boolean } = {},
): Promise<Captured> {
  const captured: Captured = { createBodies: [], patchBodies: [], deleted: [], uploaded: 0 };
  const { createStatus = 201, uploadStatus = 201 } = opts;
  // This boundary fixture exercises the UI only. Django APIClient tests cover
  // real persistence, multipart uploads and authorization independently.
  let draftDetail = {
    id: 1, title: 'Osito de prueba', slug: DRAFT_SLUG, is_active: false,
    category: CATEGORIES[0], lead_description: 'Borrador pendiente',
    badge: 'none', is_featured: false, discount_pct: 0, display_order: 100,
    has_huella: false, has_corazon: false, has_audio: false,
    huella_extra_cost: 0, corazon_extra_cost: 0, audio_extra_cost: 0,
    description: [], specifications: {}, care_instructions: [], size_prices: [],
    available_colors: [], gallery_urls: [],
  };

  await setupStaffAuth(page);
  await page.route('**/api/categories/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) })
  );
  await page.route('**/api/colors/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COLORS) })
  );
  await page.route('**/api/sizes/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  // ORDER MATTERS: Playwright resolves routes in reverse registration order, so
  // the broad /peluches/ pattern is registered FIRST and the narrower
  // color-image one LAST — otherwise the broad handler would swallow every image
  // upload and record it as a draft creation.

  // Draft create (POST) / update (PATCH) / discard (DELETE) on /peluches/
  await page.route('**/api/peluches/**', (route: Route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'POST') {
      captured.createBodies.push(req.postDataJSON());
      if (createStatus >= 400) return route.fulfill({ status: createStatus, contentType: 'application/json', body: '{}' });
      return route.fulfill({
        status: createStatus,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, slug: DRAFT_SLUG, is_active: false, available_colors: [] }),
      });
    }
    if (method === 'DELETE') {
      captured.deleted.push(new URL(req.url()).pathname);
      return route.fulfill({ status: 204, body: '' });
    }
    if (method === 'PATCH') {
      const body = req.postDataJSON() as Record<string, unknown>;
      captured.patchBodies.push(body);
      draftDetail = { ...draftDetail, ...body };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(draftDetail) });
    }
    if (method === 'GET' && new URL(req.url()).pathname.endsWith(`/${DRAFT_SLUG}/`)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(draftDetail) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Registered AFTER the broad pattern above so it wins (reverse-order matching).
  // Image upload: POST /peluches/<slug>/color-image/<colorSlug>/
  await page.route('**/api/peluches/*/color-image/**', (route: Route) => {
    if (uploadStatus >= 400) return route.fulfill({ status: uploadStatus, contentType: 'application/json', body: '{}' });
    captured.uploaded += 1;
    return route.fulfill({
      status: uploadStatus,
      contentType: 'application/json',
      body: JSON.stringify({ id: 501, url: 'https://cdn.example.com/rojo-1.png' }),
    });
  });

  await page.goto(opts.reopenDraft ? `/backoffice/peluches/${DRAFT_SLUG}` : '/backoffice/peluches/nuevo');
  await waitForPageLoad(page);
  return captured;
}

/** Title + category: the minimum the form demands before it will create a draft. */
async function fillBasics(page: Page) {
  await page.getByPlaceholder('Osito Suave Premium').fill('Osito de prueba');
  await page.getByTestId('peluch-category-select').selectOption({ label: 'Clásicos' });
}

async function selectRojo(page: Page) {
  await page.getByRole('button', { name: 'Rojo' }).click();
}

/**
 * Drives the real "+ Foto" chain: the click is what tells the form WHICH colour
 * the files belong to (`uploadingColorSlug`, PeluchForm.tsx:77/285) — feeding
 * the input without it uploads nowhere.
 */
async function addPhotos(page: Page, count: number) {
  await page.getByTestId('peluch-color-photo-add-rojo').click();
  await page.getByTestId('peluch-color-photo-input').setInputFiles(
    Array.from({ length: count }, (_, i) => ({
      name: `foto-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })),
  );
}

const galleryImage = (page: Page, nth = 0) => page.locator('img[alt=""]').nth(nth);

test.describe('Backoffice — draft peluch lifecycle', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // ── create-draft-on-color-upload ──────────────────────────────────────────
  test('the first colour photo creates the peluch as an inactive draft', { tag: [...BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD, '@outcome:success'] }, async ({ page }) => {
    // Catches: the draft being created active, which would publish a
    // half-finished product to the public catalogue the moment a photo is added.
    const captured = await setupForm(page);
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);

    await expect(page.getByText('✓')).toBeVisible();
    expect(captured.createBodies).toHaveLength(1);
    expect(captured.createBodies[0]).toMatchObject({ is_active: false, title: 'Osito de prueba' });
  });

  test('saving after a second photo batch publishes the draft', { tag: [...BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD, '@outcome:success'] }, async ({ page }) => {
    const captured = await setupForm(page);
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);
    await expect(page.getByTestId('peluch-color-photo-complete')).toHaveCount(1);
    await addPhotos(page, 1);
    await expect(page.getByTestId('peluch-color-photo-complete')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Crear peluche' })).toBeEnabled();

    await page.getByRole('button', { name: 'Crear peluche' }).click();

    await expect(page).toHaveURL(/\/backoffice\/peluches$/);
    expect(captured.createBodies).toHaveLength(1);
    expect(captured.uploaded).toBe(2);
    expect(captured.patchBodies).toEqual([
      { available_color_ids: [7] },
      expect.objectContaining({ is_active: true, title: 'Osito de prueba' }),
    ]);
  });

  test('saving a reopened draft leaves it unpublished', { tag: [...BACKOFFICE_PELUCH_EDIT, '@outcome:success'] }, async ({ page }) => {
    const captured = await setupForm(page, { reopenDraft: true });
    await expect(page.getByRole('checkbox', { name: 'Activo (visible en tienda)' })).not.toBeChecked();
    await page.getByPlaceholder('Ej: El oso más suave para llevar tus recuerdos...').fill('Borrador revisado');

    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page).toHaveURL(/\/backoffice\/peluches$/);
    expect(captured.createBodies).toHaveLength(0);
    expect(captured.patchBodies).toEqual([
      expect.objectContaining({ is_active: false, lead_description: 'Borrador revisado' }),
    ]);
  });

  test('uploading before title and category refuses and creates nothing', { tag: [...BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD, '@outcome:error'] }, async ({ page }) => {
    // Catches: a draft POSTed with an empty title/category — rows the staff
    // list would show as nameless drafts nobody can find again.
    const captured = await setupForm(page);
    await selectRojo(page);
    await addPhotos(page, 1);

    await expect(page.getByText('Completa título y categoría antes de subir fotos.')).toBeVisible();
    expect(captured.createBodies).toHaveLength(0);
  });

  test('a rejected draft creation leaves the photo in a retryable failed state', { tag: [...BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD, '@outcome:failure'] }, async ({ page }) => {
    // Catches: a backend refusal being swallowed, leaving the photo looking
    // uploaded when no draft exists to hold it.
    await setupForm(page, { createStatus: 500 });
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);

    await expect(page.getByRole('button', { name: '✗ Reintentar' })).toBeVisible();
    await expect(page.getByText('✓')).toHaveCount(0);
  });

  test('pending photo work blocks saving the peluch', { tag: [...BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD, '@outcome:display'] }, async ({ page }) => {
    // quality: allow-deep-link (el backoffice exige sesión de staff; no hay camino de UI pública hacia /backoffice/peluches/nuevo)
    // Catches: a peluch saved while a photo is still failed, publishing a
    // product whose gallery is missing the image the staff thought they added.
    await setupForm(page, { uploadStatus: 500 });
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);

    await expect(page.getByText('⚠ Hay imágenes subiendo o sin subir. Reinténtalas o quítalas para poder guardar.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear peluche' })).toBeDisabled();
  });

  // ── color-upload-per-image-status ─────────────────────────────────────────
  test('an uploaded photo reports done on its own thumbnail', { tag: [...BACKOFFICE_PELUCH_COLOR_UPLOAD_PER_IMAGE_STATUS, '@outcome:success'] }, async ({ page }) => {
    // Catches: the per-image tick never arriving, so staff cannot tell which
    // photos actually reached the server.
    await setupForm(page);
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);

    await expect(page.getByText('✓')).toBeVisible();
    await expect(galleryImage(page)).toHaveAttribute('src', 'https://cdn.example.com/rojo-1.png');
  });

  test('a rejected upload marks that photo failed and offers a retry', { tag: [...BACKOFFICE_PELUCH_COLOR_UPLOAD_PER_IMAGE_STATUS, '@outcome:failure'] }, async ({ page }) => {
    // Catches: a failed upload rendering as success, the exact case where the
    // catalogue ends up with a product whose photo silently never existed.
    await setupForm(page, { uploadStatus: 500 });
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);

    const retry = page.getByRole('button', { name: '✗ Reintentar' });
    await expect(retry).toBeVisible();
    await expect(retry).toHaveAttribute('title', 'No se pudo subir la imagen.');
  });

  test('each photo carries its own status rather than one shared banner', { tag: [...BACKOFFICE_PELUCH_COLOR_UPLOAD_PER_IMAGE_STATUS, '@outcome:display'] }, async ({ page }) => {
    // quality: allow-deep-link (el backoffice exige sesión de staff; no hay camino de UI pública hacia /backoffice/peluches/nuevo)
    // Catches: collapsing per-image state into a single form-level message —
    // with two photos and one failure, staff must see WHICH one to retry.
    await setupForm(page);
    await fillBasics(page);
    await selectRojo(page);

    // First photo succeeds, then the endpoint starts failing for the second.
    await addPhotos(page, 1);
    await expect(page.getByText('✓')).toBeVisible();

    await page.route('**/api/peluches/*/color-image/**', (route: Route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    );
    await addPhotos(page, 1);

    await expect(page.getByText('✓')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '✗ Reintentar' })).toHaveCount(1);
  });

  // ── create-cancel-discards-draft ──────────────────────────────────────────
  test('cancelling after a draft exists deletes it and returns to the list', { tag: [...BACKOFFICE_PELUCH_CREATE_CANCEL_DISCARDS_DRAFT, '@outcome:success'] }, async ({ page }) => {
    // Catches: abandoning the form leaving an orphan inactive peluch — the
    // draft rows that accumulate in the staff list with nobody to claim them.
    const captured = await setupForm(page);
    await fillBasics(page);
    await selectRojo(page);
    await addPhotos(page, 1);
    await expect(page.getByText('✓')).toBeVisible();

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('¿Descartar el borrador y sus fotos?');
      return dialog.accept();
    });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page).toHaveURL(/\/backoffice\/peluches$/);
    expect(captured.deleted).toContain(`/api/peluches/${DRAFT_SLUG}/`);
  });
});
