import { test, expect } from '../test-with-coverage'
import type { Page, TestInfo } from '@playwright/test'
import { PURCHASE_FORM_CONTROLS_COMPACT } from '../helpers/flow-tags'
import { viewportUse } from '../helpers/viewports'

// RESPONSIVE_STANDARDS FORM-3: at the compact width every text control renders at
// 16 px or more, otherwise iOS Safari zooms the page on focus while the user types.
const SLUG = 'osito-caramelo'
const TITLE = 'Osito Caramelo'
const ORDER_NUMBER = 'MIM-20261009-RS01'
const SIZE = { id: 2, label: 'Mediano', slug: 'mediano', cm: '30 cm', sort_order: 2 }
const COLOR = { id: 1, name: 'Beige', slug: 'beige', hex_code: '#F5E6D3', sort_order: 1, preview_url: '/mimittos/prod-01.svg', image_count: 1 }

const PELUCH = {
  id: 1, title: TITLE, slug: SLUG, category_name: 'Osos', category_slug: 'osos',
  lead_description: 'Peluche artesanal hecho a mano en Colombia.', badge: 'bestseller',
  is_active: true, is_featured: true, discount_pct: 0, display_order: 1,
  min_price: 119000, discounted_min_price: 119000, available_colors: [COLOR],
  gallery_urls: ['/mimittos/prod-01.svg'], average_rating: 4.8, review_count: 12,
  has_huella: true, has_corazon: true, has_audio: false,
}

const PELUCH_DETAIL = {
  ...PELUCH,
  category: { id: 1, name: 'Osos', slug: 'osos', description: '', display_order: 1, is_active: true, is_featured: true, image_url: null },
  description: ['Elaborado a mano con felpa premium.'],
  specifications: { Material: 'Felpa premium' },
  care_instructions: ['Lavar a mano con agua fría'],
  size_prices: [{ id: 10, size: SIZE, price: 119000, is_available: true, deposit_percentage: 50, full_payment_discount_pct: 5, free_shipping: false, shipping_cost: 12000 }],
  view_count: 40, huella_extra_cost: 15000, corazon_extra_cost: 12000, audio_extra_cost: 18000,
  created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
}

const PAYMENT_INFO = {
  order_number: ORDER_NUMBER, reference: 'REF-RS01', amount_in_cents: 7300000, currency: 'COP',
  total_amount: 146000, deposit_amount: 73000, balance_amount: 85000, shipping_amount: 12000,
  discount_amount: 0, payment_mode: 'deposit', amount_paid_now: 73000,
  customer_name: 'Sofía Martínez', customer_email: 'sofia@example.com', customer_phone: '3001234567', status: 'pending',
}

const WOMPI_ACCEPTANCE = {
  data: {
    presigned_acceptance: { acceptance_token: 'acc-tok-rs01', permalink: 'https://wompi.co/terms' },
    presigned_personal_data_auth: { acceptance_token: 'auth-tok-rs01' },
  },
}

const API_RESPONSES: Record<string, unknown> = {
  '/api/peluches/': [PELUCH],
  '/api/categories/': [],
  '/api/sizes/': [SIZE],
  [`/api/peluches/${SLUG}/`]: PELUCH_DETAIL,
  [`/api/peluches/${SLUG}/reviews/`]: [],
  '/api/content/promo_banner/': { key: 'promo_banner', content_json: { is_active: false }, updated_at: '2026-10-01T00:00:00Z' },
  [`/api/payment/info/${ORDER_NUMBER}/`]: PAYMENT_INFO,
}

async function mockStorefront(page: Page, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('Purchase form controls require a local baseURL')
  const origin = new URL(baseURL).origin
  await page.route((url) => url.origin !== origin, (route) => route.abort())
  await page.route('https://sandbox.wompi.co/v1/merchants/**', (route) => route.fulfill({ json: WOMPI_ACCEPTANCE }))
  await page.route(`${origin}/api/**`, (route) => route.fulfill({
    json: API_RESPONSES[new URL(route.request().url()).pathname] ?? {},
  }))
}

test.describe('Purchase form controls @ 412 (celular)', () => {
  test.use(viewportUse('compact'))

  // Fails if the huella or corazón inputs fall back to 13 px: iOS zooms on every focus (FORM-3).
  test('personalization fields keep typed text at 16 px on the product detail', {
    tag: [...PURCHASE_FORM_CONTROLS_COMPACT, '@outcome:success', '@viewport:compact'],
  }, async ({ page }, testInfo) => {
    await mockStorefront(page, testInfo)
    await page.goto('/catalog')
    await page.getByRole('link', { name: new RegExp(TITLE) }).click()
    await expect(page).toHaveURL(new RegExp(`/peluches/${SLUG}$`))
    const huellaName = page.getByPlaceholder('Escribe el nombre aquí...')
    const corazonPhrase = page.getByPlaceholder('Una frase especial (máx. 50 caracteres)')

    await huellaName.fill('Luna')
    await corazonPhrase.fill('Te quiero hasta la luna')

    await expect(huellaName).toHaveValue('Luna')
    await expect(corazonPhrase).toHaveValue('Te quiero hasta la luna')
    await expect(page.getByText('23/50', { exact: true })).toBeVisible()
    await expect(huellaName).toHaveCSS('font-size', '16px')
    await expect(corazonPhrase).toHaveCSS('font-size', '16px')
  })

  // Fails if the card holder, expiry or CVV inputs fall back to 14 px: iOS zooms on every focus (FORM-3).
  test('card fields keep typed details at 16 px on the payment page', {
    tag: [...PURCHASE_FORM_CONTROLS_COMPACT, '@outcome:success', '@viewport:compact'],
  }, async ({ page }, testInfo) => {
    await mockStorefront(page, testInfo)
    await page.goto(`/payment?order=${ORDER_NUMBER}&amount=73000`)
    await page.getByRole('button', { name: /Tarjeta/ }).click()
    const holder = page.getByPlaceholder('Como aparece en la tarjeta')
    const expiry = page.getByPlaceholder('MM/AA')
    const cvv = page.getByPlaceholder('···')

    await holder.fill('Sofia Martinez')
    await expiry.fill('1230')
    await cvv.fill('123')

    await expect(holder).toHaveValue('Sofia Martinez')
    await expect(expiry).toHaveValue('12/30')
    await expect(cvv).toHaveValue('123')
    await expect(holder).toHaveCSS('font-size', '16px')
    await expect(expiry).toHaveCSS('font-size', '16px')
    await expect(cvv).toHaveCSS('font-size', '16px')
  })
})
