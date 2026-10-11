import { test, expect } from '../test-with-coverage'
import type { Page, Route, TestInfo } from '@playwright/test'
import { waitForPageLoad } from '../fixtures'
import { BACKOFFICE_PROMO_BANNER_SAVE, BACKOFFICE_HERO_IMAGE_UPLOAD } from '../helpers/flow-tags'

const mockAdmin = {
  id: 1,
  email: 'admin@mimittos.co',
  first_name: 'Admin',
  last_name: 'User',
  role: 'admin',
  is_staff: true,
  is_active: true,
}

const mockPromoBanner = {
  is_active: true,
  message: '¡Envío gratis en compras mayores a $200.000!',
  bg_color: '#1B2A4A',
  text_color: '#FFFFFF',
}

async function setupStaffAuth(page: Page, origin = 'http://localhost:3001') {
  await page.context().addCookies([
    { name: 'access_token', value: 'fake-admin-access', domain: new URL(origin).hostname, path: '/' },
    { name: 'refresh_token', value: 'fake-admin-refresh', domain: new URL(origin).hostname, path: '/' },
  ])
  await page.route('**/api/validate_token/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, user: mockAdmin }) }),
  )
  await page.route('**/api/token/refresh/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'fake-admin-access' }) }),
  )
}

function heldBannerRead() {
  let markStarted!: () => void
  let release!: (value: { status: number; content: typeof mockPromoBanner }) => void
  const started = new Promise<void>((resolve) => { markStarted = resolve })
  const response = new Promise<{ status: number; content: typeof mockPromoBanner }>((resolve) => { release = resolve })
  return {
    started,
    resolve: (status = 200, content = mockPromoBanner) => release({ status, content }),
    fulfill: async (route: Route) => {
      markStarted()
      const { status, content } = await response
      await route.fulfill({ status, json: status === 200
        ? { key: 'promo_banner', content_json: content }
        : { detail: 'banner unavailable' } })
    },
  }
}

async function setupBannerMocks(page: Page, testInfo: TestInfo, reads: ReturnType<typeof heldBannerRead>[]) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('Playwright requires project.use.baseURL for local API isolation')
  const origin = new URL(baseURL).origin
  await page.route((url) => url.origin !== origin, (route) => route.abort())
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }))
  await setupStaffAuth(page, origin)
  await page.route('**/api/content/hero_image/', (route) => route.fulfill({ json: { key: 'hero_image', content_json: {} } }))
  const writes: typeof mockPromoBanner[] = []
  let readIndex = 0
  await page.route('**/api/content/promo_banner/', async (route) => {
    if (route.request().method() === 'GET') {
      await reads[readIndex].fulfill(route)
      return
    }
    const { content_json: content } = route.request().postDataJSON() as { content_json: typeof mockPromoBanner }
    writes.push(content)
    await route.fulfill({ json: { key: 'promo_banner', content_json: content } })
  })
  return { writes, nextRead: () => { readIndex += 1 } }
}

// Fails if editing or saving defaults is possible before the existing banner has been read.
test('saves the banner only after loading its existing configuration',
  { tag: [...BACKOFFICE_PROMO_BANNER_SAVE, '@outcome:success'] }, async ({ page }, testInfo) => {
    const read = heldBannerRead()
    const { writes } = await setupBannerMocks(page, testInfo, [read])
    await page.goto('/backoffice/configuracion')
    await read.started
    const banner = page.getByRole('region', { name: 'Cinta de promoción', exact: true })
    const message = banner.getByPlaceholder('ej: ¡Envío gratis en compras mayores a $200.000! 🎁', { exact: true })

    await expect(banner.getByRole('status')).toHaveText('Cargando cinta…')
    await expect(message).toBeDisabled()
    await expect(banner.getByRole('button', { name: 'Guardar cinta', exact: true })).toBeDisabled()
    expect(writes).toEqual([])
    read.resolve()
    await expect(message).toHaveValue(mockPromoBanner.message)
    await message.fill('¡Nuevo mensaje!')
    await banner.getByRole('button', { name: 'Guardar cinta', exact: true }).click()

    await expect(banner.getByRole('button', { name: '✓ Guardado', exact: true })).toBeVisible()
    expect(writes).toEqual([{ ...mockPromoBanner, message: '¡Nuevo mensaje!' }])
  })

// Fails if a failed read unlocks default values or leaves staff without a manual retry path.
test('retries the failed banner read before enabling configuration changes',
  { tag: [...BACKOFFICE_PROMO_BANNER_SAVE, '@outcome:failure', '@outcome:success'] }, async ({ page }, testInfo) => {
    const firstRead = heldBannerRead()
    const retryRead = heldBannerRead()
    const boundary = await setupBannerMocks(page, testInfo, [firstRead, retryRead])
    await page.goto('/backoffice/configuracion')
    await firstRead.started
    firstRead.resolve(500)
    const banner = page.getByRole('region', { name: 'Cinta de promoción', exact: true })
    const message = banner.getByPlaceholder('ej: ¡Envío gratis en compras mayores a $200.000! 🎁', { exact: true })

    await expect(banner.getByRole('alert')).toHaveText('No se pudo cargar la cinta de promoción. Intenta de nuevo.')
    await expect(message).toBeDisabled()
    await expect(banner.getByRole('button', { name: 'Guardar cinta', exact: true })).toBeDisabled()
    boundary.nextRead()
    await banner.getByRole('button', { name: 'Reintentar carga', exact: true }).click()
    await retryRead.started
    await expect(banner.getByRole('status')).toHaveText('Cargando cinta…')
    await expect(message).toBeDisabled()
    await expect(banner.getByRole('button', { name: 'Guardar cinta', exact: true })).toBeDisabled()
    expect(boundary.writes).toEqual([])
    retryRead.resolve(200, { ...mockPromoBanner, is_active: false, message: 'Cinta recuperada' })

    await expect(message).toHaveValue('Cinta recuperada')
    await expect(banner.getByRole('button', { name: 'Guardar cinta', exact: true })).toBeEnabled()
  })

// quality: disable test_too_long (hero image upload flow: auth + file selection + upload + preview verification)
test(
  'should send multipart POST when staff uploads a hero image',
  { tag: [...BACKOFFICE_HERO_IMAGE_UPLOAD] },
  async ({ page }) => {
    await setupStaffAuth(page)

    await page.route('**/api/content/promo_banner/**', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: 'promo_banner', content_json: mockPromoBanner }),
      }),
    )
    await page.route('**/api/content/hero-image/**', (route: Route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'hero_image', content_json: { url: 'https://example.com/hero.jpg' } }),
        })
      } else {
        route.continue()
      }
    })

    await page.route('**/api/content/hero-image/upload/**', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.com/new-hero.jpg' }),
      }),
    )

    await page.goto('/backoffice/configuracion')
    await waitForPageLoad(page)

    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/sign-in/)

    // File input is hidden (display:none) but Playwright setInputFiles works on hidden inputs
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'hero.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    })

    // After file is selected the upload button becomes enabled
    const uploadBtn = page.getByRole('button', { name: /Subir imagen/i })
    await expect(uploadBtn).toBeEnabled({ timeout: 5_000 })

    const uploadRequest = page.waitForRequest(
      (req) => req.url().includes('/api/content/hero-image/upload/') && req.method() === 'POST',
      { timeout: 10_000 },
    )
    await uploadBtn.click()
    await uploadRequest
  },
)
