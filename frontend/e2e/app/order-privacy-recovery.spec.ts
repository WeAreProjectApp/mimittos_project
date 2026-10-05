import { expect, test } from '../test-with-coverage'
import { VIEWPORTS } from '../helpers/viewports'
import type { Page, Route } from '@playwright/test'

const ORDER = 'ORD-1'
const EMAIL = 'ana@example.com'
const ACCESS_TOKEN = 'access-token-1'
const accessExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

const paymentInfo = {
  order_number: ORDER,
  reference: 'REF-1',
  amount_in_cents: 50000,
  currency: 'COP',
  total_amount: 100000,
  deposit_amount: 50000,
  balance_amount: 50000,
  shipping_amount: 0,
  discount_amount: 0,
  payment_mode: 'deposit',
  amount_paid_now: 50000,
  customer_name: 'Ana',
  customer_email: EMAIL,
  customer_phone: '3001234567',
  status: 'approved',
}

const trackingInfo = {
  order_number: ORDER,
  status: 'pending_payment',
  payment_status: 'PENDING',
  customer_name: 'Ana',
  customer_phone: '3001234567',
  address: 'Calle 1',
  city: 'Bogotá',
  department: 'Cundinamarca',
  postal_code: '',
  created_at: '2026-10-02T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  tracking_number: '',
  shipping_carrier: '',
  checkout_url: '',
  items: [],
}

function isAccessHeader(route: Route) {
  return route.request().headers()['x-order-access'] === ACCESS_TOKEN
}

async function installAccessBoundary(page: Page, path: 'tracking' | 'payment' | 'confirmed', options: { requestFails?: boolean; verifyFails?: boolean } = {}) {
  const protectedPath = path === 'tracking'
    ? `/api/orders/track/${ORDER}/`
    : `/api/payment/info/${ORDER}/`

  await page.route(`**${protectedPath}`, (route) => {
    if (!isAccessHeader(route)) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'order_access_required' }) })
    }
    const result = path === 'tracking' ? trackingInfo : path === 'payment' ? { ...paymentInfo, status: 'pending' } : paymentInfo
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.route(`**/orders/${ORDER}/access/request/**`, (route) => {
    if (options.requestFails) return route.abort('failed')
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ detail: 'accepted' }) })
  })
  await page.route(`**/orders/${ORDER}/access/verify/**`, (route) => {
    if (options.verifyFails) return route.abort('failed')
    const body = route.request().postDataJSON() as { code?: string }
    if (body.code !== '123456') {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'invalid' }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order_access_token: ACCESS_TOKEN, expires_at: accessExpiry() }) })
  })
  if (path === 'payment') {
    await page.route('**/api/payment/pse-banks/', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.route('https://sandbox.wompi.co/**/merchants/**', (route) => {
      expect(route.request().headers()['x-order-access']).toBeUndefined()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { presigned_acceptance: { acceptance_token: 'acceptance', permalink: 'https://example.test/terms' }, presigned_personal_data_auth: { acceptance_token: 'personal' } } }) })
    })
  }
  if (path === 'confirmed') {
    await page.route(`**/api/payment/check/${ORDER}/`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'approved', order_status: 'payment_confirmed', synced: true, wompi_status_message: '', payment_method_type: 'CARD', amount_in_cents: 50000 }) }))
  }
}

function routeFor(path: 'tracking' | 'payment' | 'confirmed') {
  if (path === 'tracking') return `/tracking?order=${ORDER}`
  if (path === 'payment') return `/payment?order=${ORDER}`
  return `/order-confirmed?order=${ORDER}`
}

async function requestAndVerify(page: Page) {
  await page.getByLabel('Correo del pedido').fill(EMAIL)
  await page.getByTestId('order-access-request-button').click()
  await expect(page.getByRole('status')).toHaveText(/Si los datos coinciden/)
  await page.getByLabel('Código de 6 dígitos').fill('123456')
  await page.getByTestId('order-access-verify-button').click()
}

// Fails if an unauthorized media item sends users to an empty cart or overwrites its variant/quantity.
test('recovers the second personalization without replacing sibling lines @flow:checkout-personalization-media-recovery @outcome:error @outcome:success', async ({ page }) => {
  // This is the persisted-cart boundary used by the checkout itself; the recovery is driven through its visible link and file chooser.
  await page.addInitScript(() => {
    localStorage.setItem('cart', JSON.stringify({ state: { items: [
      { peluch_id: 11, peluch_slug: 'oso-prueba', title: 'Oso intacto', size_id: 21, size_label: 'Mediano', color_id: 31, color_name: 'Coral', color_hex: '#f00', unit_price: 100000, personalization_cost: 0, quantity: 2, gallery_urls: [], has_huella: false, huella_type: '', huella_text: '', huella_media_id: null, has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
      { peluch_id: 12, peluch_slug: 'conejo-prueba', title: 'Conejo afectado', size_id: 22, size_label: 'Pequeño', color_id: 32, color_name: 'Crema', color_hex: '#fff', unit_price: 80000, personalization_cost: 5000, quantity: 1, gallery_urls: [], has_huella: true, huella_type: 'image', huella_text: '', huella_media_id: 91, huella_media_token: 'old', has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
    ] }, version: 0 }))
  })
  const peluch = { id: 12, title: 'Conejo afectado', slug: 'conejo-prueba', category_name: 'Prueba', category_slug: 'prueba', lead_description: '', badge: 'none', is_active: true, is_featured: false, discount_pct: 0, display_order: 0, min_price: 80000, discounted_min_price: 80000, available_colors: [{ id: 32, name: 'Crema', slug: 'crema', hex_code: '#fff', sort_order: 1, preview_url: null, image_count: 0, images: [] }], gallery_urls: [], average_rating: 0, review_count: 0, has_huella: true, has_corazon: false, has_audio: false, category: { id: 1, name: 'Prueba', slug: 'prueba', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null }, description: [], specifications: {}, care_instructions: [], size_prices: [{ id: 1, size: { id: 22, label: 'Pequeño', slug: 'pequeno', cm: '20 cm', sort_order: 1 }, price: 80000, is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 }], view_count: 0, huella_extra_cost: 5000, corazon_extra_cost: 0, audio_extra_cost: 0, created_at: '', updated_at: '' }
  await page.route('**/api/peluches/conejo-prueba/', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(peluch) }))
  await page.route('**/api/peluches/conejo-prueba/reviews/', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  let createAttempt = 0
  await page.route('**/api/orders/', (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    createAttempt += 1
    if (createAttempt === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ items: [{}, { huella_media_token: ['Vuelve a subir la imagen para continuar.'] }] }) })
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ order_number: 'RECOVERED-1', amount_paid_now: 50000, is_guest: true, order_access_token: ACCESS_TOKEN, expires_at: accessExpiry() }) })
  })
  await page.goto('/checkout')
  await page.getByText('Nombre completo').locator('..').getByRole('textbox').fill('Ana')
  await page.getByText('Correo electrónico').locator('..').getByRole('textbox').fill(EMAIL)
  await page.getByText('Celular').locator('..').getByRole('textbox').fill('3001234567')
  await page.getByPlaceholder('Calle 50 # 40-20, Apto 301').fill('Calle 1')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Ir a pagar/i }).click()
  const recovery = page.getByRole('link', { name: 'Volver a personalizar Conejo afectado' })
  await expect(recovery).toHaveAttribute('href', '/peluches/conejo-prueba?cartItem=12-22-32')
  await recovery.click()
  await page.route('**/api/media/upload/', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ media_id: 92, media_token: 'new-media-token', file_url: '/media/new.png', duration_sec: null, file_size_kb: 1 }) }))
  // quality: allow-fragile-selector (the native file input has no label or test id; the preceding button is the user interaction).
  await page.locator('input[type="file"]').setInputFiles({ name: 'huella.png', mimeType: 'image/png', buffer: Buffer.from('png') })
  await expect(page.getByRole('button', { name: /Imagen subida/ })).toHaveText(/Imagen subida/)
  await page.getByRole('button', { name: 'Guardar personalización' }).click()
  const summary = page.getByRole('heading', { name: 'Tu pedido' }).locator('..')
  await expect(summary.getByText('Oso intacto', { exact: true })).toHaveText('Oso intacto')
  await expect(summary.getByText('× 2 · Mediano · Coral')).toHaveText('× 2 · Mediano · Coral')
  await page.getByText('Nombre completo').locator('..').getByRole('textbox').fill('Ana')
  await page.getByText('Correo electrónico').locator('..').getByRole('textbox').fill(EMAIL)
  await page.getByText('Celular').locator('..').getByRole('textbox').fill('3001234567')
  await page.getByPlaceholder('Calle 50 # 40-20, Apto 301').fill('Calle 1')
  await page.getByRole('checkbox').check()
  const secondOrder = page.waitForRequest((request) => request.url().endsWith('/api/orders/') && request.method() === 'POST')
  await page.getByRole('button', { name: /Ir a pagar/i }).click()
  const payload = secondOrder.then((request) => request.postDataJSON() as { items: Array<{ huella_media_token?: string; quantity: number }> })
  await expect(page).toHaveURL(/order=RECOVERED-1/)
  expect((await payload).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ peluch_id: 11, size_id: 21, color_id: 31, quantity: 2 }),
    expect.objectContaining({ peluch_id: 12, size_id: 22, color_id: 32, quantity: 1, huella_media_token: 'new-media-token' }),
  ]))
})

// Fails if temporary media storage leaves a recovery cart without a retry path or changes either sibling line.
test('keeps both lines recoverable after a media upload failure @flow:checkout-personalization-media-recovery @outcome:failure', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cart', JSON.stringify({ state: { items: [
      { peluch_id: 11, peluch_slug: 'oso-prueba', title: 'Oso intacto', size_id: 21, size_label: 'Mediano', color_id: 31, color_name: 'Coral', color_hex: '#f00', unit_price: 100000, personalization_cost: 0, quantity: 2, gallery_urls: [], has_huella: false, huella_type: '', huella_text: '', huella_media_id: null, has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
      { peluch_id: 12, peluch_slug: 'conejo-prueba', title: 'Conejo afectado', size_id: 22, size_label: 'Pequeño', color_id: 32, color_name: 'Crema', color_hex: '#fff', unit_price: 80000, personalization_cost: 5000, quantity: 1, gallery_urls: [], has_huella: true, huella_type: 'image', huella_text: '', huella_media_id: 91, huella_media_token: 'old', has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
    ] }, version: 0 }))
  })
  const peluch = { id: 12, title: 'Conejo afectado', slug: 'conejo-prueba', category_name: 'Prueba', category_slug: 'prueba', lead_description: '', badge: 'none', is_active: true, is_featured: false, discount_pct: 0, display_order: 0, min_price: 80000, discounted_min_price: 80000, available_colors: [{ id: 32, name: 'Crema', slug: 'crema', hex_code: '#fff', sort_order: 1, preview_url: null, image_count: 0, images: [] }], gallery_urls: [], average_rating: 0, review_count: 0, has_huella: true, has_corazon: false, has_audio: false, category: { id: 1, name: 'Prueba', slug: 'prueba', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null }, description: [], specifications: {}, care_instructions: [], size_prices: [{ id: 1, size: { id: 22, label: 'Pequeño', slug: 'pequeno', cm: '20 cm', sort_order: 1 }, price: 80000, is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 }], view_count: 0, huella_extra_cost: 5000, corazon_extra_cost: 0, audio_extra_cost: 0, created_at: '', updated_at: '' }
  await page.route('**/api/peluches/conejo-prueba/', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(peluch) }))
  await page.route('**/api/peluches/conejo-prueba/reviews/', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/orders/', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ items: [{}, { huella_media_token: ['Vuelve a subir la imagen para continuar.'] }] }) })
    : route.continue())
  await page.goto('/checkout')
  await page.getByText('Nombre completo').locator('..').getByRole('textbox').fill('Ana')
  await page.getByText('Correo electrónico').locator('..').getByRole('textbox').fill(EMAIL)
  await page.getByText('Celular').locator('..').getByRole('textbox').fill('3001234567')
  await page.getByPlaceholder('Calle 50 # 40-20, Apto 301').fill('Calle 1')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Ir a pagar/i }).click()
  await page.getByRole('link', { name: 'Volver a personalizar Conejo afectado' }).click()
  await page.route('**/api/media/upload/', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Almacenamiento temporal no disponible.' }) }))
  // quality: allow-fragile-selector (the native file input has no label or test id; its visible upload button is asserted below).
  await page.locator('input[type="file"]').setInputFiles({ name: 'huella.png', mimeType: 'image/png', buffer: Buffer.from('png') })
  await expect(page.getByRole('alert').filter({ hasText: 'Almacenamiento temporal no disponible.' })).toHaveText('Almacenamiento temporal no disponible.')
  await expect(page.getByRole('button', { name: 'Subir imagen' })).toBeEnabled()
  await Promise.all([page.waitForURL('**/cart'), page.getByRole('link', { name: 'Carrito' }).press('Enter')])
  await page.getByRole('link', { name: 'Continuar al checkout' }).click()
  const summary = page.getByRole('heading', { name: 'Tu pedido' }).locator('..')
  await expect(summary.getByText('Oso intacto', { exact: true })).toHaveText('Oso intacto')
  await expect(summary.getByText('× 2 · Mediano · Coral')).toHaveText('× 2 · Mediano · Coral')
  await expect(summary.getByText('Conejo afectado', { exact: true })).toHaveText('Conejo afectado')
  await expect(summary.getByText('× 1 · Pequeño · Crema')).toHaveText('× 1 · Pequeño · Crema')
})

const accessRecoveryCases = [
  { path: 'tracking' as const, beforeVerify: (_page: Page) => null, expected: async (page: Page, _merchant: Promise<import('@playwright/test').Request> | null) => expect(page.getByText('Pedido recibido')).toHaveText('Pedido recibido') },
  { path: 'payment' as const, beforeVerify: (page: Page) => page.waitForRequest((request) => new URL(request.url()).hostname === 'sandbox.wompi.co' && request.url().includes('/merchants/')), expected: async (page: Page, merchant: Promise<import('@playwright/test').Request> | null) => { await expect(page.getByRole('heading', { name: '¿Cómo quieres pagar?' })).toHaveText('¿Cómo quieres pagar?'); const request = await merchant!; expect(new URL(request.url()).hostname).toBe('sandbox.wompi.co'); expect(request.headers()['x-order-access']).toBeUndefined() } },
  { path: 'confirmed' as const, beforeVerify: (_page: Page) => null, expected: async (page: Page, _merchant: Promise<import('@playwright/test').Request> | null) => expect(page.getByRole('heading', { name: '¡Pedido confirmado!' })).toHaveText('¡Pedido confirmado!') },
]

for (const recoveryCase of accessRecoveryCases) {
  // Fails if this private page does not retry with the scoped capability after the visible recovery form succeeds.
  test(`retries ${recoveryCase.path} with the order access header @flow:order-access-recovery @outcome:failure @outcome:success`, async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await installAccessBoundary(page, recoveryCase.path)
    await page.goto(routeFor(recoveryCase.path))
    await expect(page.getByTestId('order-access-recovery')).toContainText('Accede a tu pedido')
    const merchantRequest = recoveryCase.beforeVerify(page)
    await requestAndVerify(page)
    await recoveryCase.expected(page, merchantRequest)
  })
}

// Fails if an emailed capability remains in the address bar or reaches pageview analytics.
test('consumes an emailed access fragment before the tracked request @flow:order-access-recovery @outcome:success', async ({ page }) => {
  let trackingHeader = ''
  const pageViewRequest = page.waitForRequest((request) => request.url().includes('/api/analytics/pageview/') && request.method() === 'POST')
  await page.route('**/api/analytics/pageview/', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/orders/track/${ORDER}/`, (route) => { trackingHeader = route.request().headers()['x-order-access'] ?? ''; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trackingInfo) }) })
  await page.goto(`/tracking?order=${ORDER}#access=${ACCESS_TOKEN}`)
  await expect(page).toHaveURL(new RegExp(`/tracking\\?order=${ORDER}$`))
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('Pedido recibido')).toHaveText('Pedido recibido')
  const pageViewPayload = (await pageViewRequest).postData() ?? ''
  expect(trackingHeader).toBe(ACCESS_TOKEN)
  expect(pageViewPayload).toContain('"url_path":"/tracking"')
  expect(pageViewPayload).not.toBe('')
  expect(pageViewPayload).not.toContain(ACCESS_TOKEN)
  expect(pageViewPayload).not.toContain('access=')
})

async function openTrackingRecovery(page: Page) {
  await page.goto(routeFor('tracking'))
  await expect(page.getByTestId('order-access-recovery')).toContainText('Accede a tu pedido')
}

// Fails if a network error requesting a code leaves visitors without an actionable message.
test('shows request network failure in recovery @flow:order-access-recovery @outcome:failure', async ({ page }) => {
  await installAccessBoundary(page, 'tracking', { requestFails: true })
  await openTrackingRecovery(page)
  await page.getByLabel('Correo del pedido').fill(EMAIL)
  await page.getByTestId('order-access-request-button').click()
  await expect(page.getByTestId('order-access-recovery').getByRole('alert')).toHaveText('No pudimos solicitar el código. Intenta de nuevo más tarde.')
})

// Fails if a bad code exposes a specific account outcome or prevents another recovery attempt.
test('keeps invalid code feedback generic in recovery @flow:order-access-recovery @outcome:error', async ({ page }) => {
  await installAccessBoundary(page, 'tracking')
  await openTrackingRecovery(page)
  await page.getByLabel('Correo del pedido').fill(EMAIL)
  await page.getByTestId('order-access-request-button').click()
  await page.getByLabel('Código de 6 dígitos').fill('000000')
  await page.getByTestId('order-access-verify-button').click()
  await expect(page.getByTestId('order-access-recovery').getByRole('alert')).toHaveText('No pudimos verificar el código. Revisa los datos o solicita uno nuevo más tarde.')
})

// Fails if the verification transport error loses the visitor's recovery route.
test('shows verify network failure in recovery @flow:order-access-recovery @outcome:failure', async ({ page }) => {
  await installAccessBoundary(page, 'tracking')
  await page.unroute(`**/orders/${ORDER}/access/verify/**`)
  await page.route(`**/orders/${ORDER}/access/verify/**`, (route) => route.abort('failed'))
  await openTrackingRecovery(page)
  await page.getByLabel('Correo del pedido').fill(EMAIL)
  await page.getByTestId('order-access-request-button').click()
  await page.getByLabel('Código de 6 dígitos').fill('123456')
  await page.getByTestId('order-access-verify-button').click()
  await expect(page.getByTestId('order-access-recovery').getByRole('alert')).toHaveText('No pudimos verificar el código. Revisa los datos o solicita uno nuevo más tarde.')
})

// Fails if blocked local storage prevents a granted capability from being used in the current page session.
test('uses in-memory access when storage is blocked @flow:order-access-recovery @outcome:success', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { value: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } } }))
  await installAccessBoundary(page, 'tracking')
  await openTrackingRecovery(page)
  await requestAndVerify(page)
  await expect(page.getByText('Pedido recibido')).toHaveText('Pedido recibido')
})

// Fails if a denied tracking lookup clears the entered number or reveals order data before verification.
test('keeps the visible tracking search private until recovery @flow:order-access-recovery @outcome:display', async ({ page }) => {
  await page.route(`**/api/orders/track/${ORDER}/`, (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'order_access_required' }) }))
  await page.goto('/tracking')
  const search = page.getByPlaceholder('Ej: PELUCH-20260420-XXXX')
  await search.fill(ORDER)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(search).toHaveValue(ORDER)
  await expect(page.getByTestId('order-access-recovery').getByLabel('Correo del pedido')).toBeEditable()
  await expect(page.getByText('Ana', { exact: true })).toHaveCount(0)
  await expect(page.getByText(EMAIL, { exact: true })).toHaveCount(0)
  await expect(page.getByText('Calle 123', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Pedido recibido', { exact: true })).toHaveCount(0)
})

// Fails if the visible header-to-checkout journey loses either cart line before the media validation response.
test('shows both cart lines before personalization recovery @flow:checkout-personalization-media-recovery @outcome:display', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cart', JSON.stringify({ state: { items: [
      { peluch_id: 11, peluch_slug: 'oso-prueba', title: 'Oso intacto', size_id: 21, size_label: 'Mediano', color_id: 31, color_name: 'Coral', color_hex: '#f00', unit_price: 100000, personalization_cost: 0, quantity: 2, gallery_urls: [], has_huella: false, huella_type: '', huella_text: '', huella_media_id: null, has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
      { peluch_id: 12, peluch_slug: 'conejo-prueba', title: 'Conejo afectado', size_id: 22, size_label: 'Pequeño', color_id: 32, color_name: 'Crema', color_hex: '#fff', unit_price: 80000, personalization_cost: 5000, quantity: 1, gallery_urls: [], has_huella: true, huella_type: 'image', huella_text: '', huella_media_id: 91, huella_media_token: 'old', has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
    ] }, version: 0 }))
  })
  await page.goto('/')
  await Promise.all([
    page.waitForURL('**/cart'),
    page.getByRole('link', { name: 'Carrito' }).press('Enter'),
  ])
  await expect(page.getByRole('heading', { name: 'Oso intacto' })).toHaveText('Oso intacto')
  await expect(page.getByRole('heading', { name: 'Conejo afectado' })).toHaveText('Conejo afectado')
  await expect(page.getByText('3 peluches')).toHaveText('3 peluches')
  await page.getByRole('link', { name: 'Continuar al checkout' }).click()
  const summary = page.getByRole('heading', { name: 'Tu pedido' }).locator('..')
  await expect(summary.getByText('Oso intacto', { exact: true })).toHaveText('Oso intacto')
  await expect(summary.getByText('Conejo afectado', { exact: true })).toHaveText('Conejo afectado')
  await expect(summary.getByText('× 2 · Mediano · Coral')).toHaveText('× 2 · Mediano · Coral')
  await expect(summary.getByText('× 1 · Pequeño · Crema')).toHaveText('× 1 · Pequeño · Crema')
  await expect(page.getByText('Tu carrito está vacío')).toHaveCount(0)
})

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  // Fails if the access form cannot submit at one of the project’s canonical viewport sizes.
  test(`keeps recovery actionable at ${name} @flow:order-access-recovery @outcome:success`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await installAccessBoundary(page, 'tracking')
    await page.goto(routeFor('tracking'))
    const recovery = page.getByTestId('order-access-recovery')
    await expect(recovery.getByLabel('Correo del pedido')).toBeEditable()
    await expect(recovery.getByTestId('order-access-request-button')).toBeEnabled()
    await page.getByLabel('Correo del pedido').fill(EMAIL)
    await page.getByTestId('order-access-request-button').click()
    await expect(recovery.getByLabel('Código de 6 dígitos')).toBeEditable()
    expect(await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  })
}
