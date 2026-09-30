import { test, expect } from '../test-with-coverage'
import type { Page, Route, TestInfo } from '@playwright/test'
import { waitForPageLoad } from '../fixtures'
import { HOME_FAQ, HOME_LOADS, HOME_PRODUCT_CAROUSEL, HOME_TO_CATALOG } from '../helpers/flow-tags'
import { VIEWPORTS, type ViewportAlias, viewportUse } from '../helpers/viewports'

/**
 * Responsive home regressions: an over-wide testimonial, a heading that wraps
 * into too many lines, or an 8px carousel control must fail these user-facing
 * checks at the project viewport matrix.
 */

const HOME_VIEWPORTS = Object.keys(VIEWPORTS) as ViewportAlias[]
const HEADING_LINE_LIMITS: Record<ViewportAlias, number> = {
  compact: 2,
  portrait: 2,
  landscape: 3,
  desktop: 3,
  wide: 3,
}

const CATEGORIES = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  name: `Recuerdos de familia ${index + 1}`,
  slug: `recuerdos-${index + 1}`,
  description: 'Una historia hecha abrazo.',
  display_order: index + 1,
  is_active: true,
  is_featured: true,
  image_url: null,
}))

const PELUCHES = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  title: `Abrazo artesanal especial ${index + 1}`,
  slug: `abrazo-${index + 1}`,
  category_name: 'Recuerdos',
  category_slug: 'recuerdos-1',
  lead_description: 'Hecho a mano para guardar una historia.',
  badge: 'none' as const,
  is_active: true,
  is_featured: true,
  discount_pct: 0,
  display_order: index + 1,
  min_price: 120000,
  discounted_min_price: null,
  available_colors: [],
  gallery_urls: [],
  average_rating: 5,
  review_count: 6,
  has_huella: false,
  has_corazon: false,
  has_audio: false,
}))

const REVIEWS = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  user_name: `FamiliaConUnNombreExtenso${index + 1}`,
  peluch_title: `Abrazo artesanal especial ${index + 1}`,
  rating: 5,
  comment: 'Nuestro abrazo llegó lleno de detalles y se convirtió en un recuerdo familiar que queremos cuidar para siempre.',
}))

const SIZES = [{ id: 1, label: 'Pequeño', slug: 'pequeno', cm: '20 cm', sort_order: 1 }]

function appOrigin(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('Playwright requires project.use.baseURL for local API isolation')
  return new URL(baseURL).origin
}

async function mockHomeApis(page: Page, testInfo: TestInfo) {
  const origin = appOrigin(testInfo)
  await page.route((url) => url.origin !== origin, (route) => route.abort())
  // Register the safe fallback first: later, exact fixture routes take precedence.
  await page.route('**/api/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/api/categories/featured/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) }),
  )
  await page.route('**/api/peluches/featured/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PELUCHES) }),
  )
  await page.route('**/api/reviews/home/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REVIEWS) }),
  )
  await page.route('**/api/content/hero_image/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content_json: { image_url: null } }) }),
  )
  await page.route('**/api/content/promo_banner/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content_json: { is_active: false, message: '' } }) }),
  )
}

async function mockCatalogApis(page: Page) {
  await page.route('**/api/categories/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) }),
  )
  await page.route('**/api/sizes/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIZES) }),
  )
  await page.route('**/api/peluches/?**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PELUCHES) }),
  )
}

async function expectNoHorizontalOverflow(page: Page) {
  const [scrollWidth, viewportWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth)
}

for (const viewport of HOME_VIEWPORTS) {
  test.describe(`Home layout at ${viewport}`, () => {
    test.use(viewportUse(viewport))

    test(
      `fits home content within ${viewport}`,
      { tag: [...HOME_LOADS, '@outcome:display', `@viewport:${viewport}`] },
      async ({ page }, testInfo) => {
        // quality: allow-duplicate (per-viewport contract: home-loads @ ${viewport})
        await mockHomeApis(page, testInfo)
        await page.goto('/')
        await waitForPageLoad(page)

        const heading = page.getByTestId('home-heading')
        await expect(heading).toHaveCSS('opacity', '1')

        const review = page.getByTestId('home-review-1')
        await review.scrollIntoViewIfNeeded()
        await expect(review).toHaveCSS('opacity', '1')
        await expect(page.getByTestId('home-reviews').getByTestId(/home-review-/)).toHaveCount(6)

        const longName = review.getByText('FamiliaConUnNombreExtenso1', { exact: true })
        const nameBounds = await longName.boundingBox()
        const reviewBounds = await review.boundingBox()
        expect(nameBounds).not.toBeNull()
        expect(reviewBounds).not.toBeNull()
        expect(nameBounds!.x + nameBounds!.width).toBeLessThanOrEqual(reviewBounds!.x + reviewBounds!.width)

        const faq = page.getByTestId('home-faq-0')
        await faq.scrollIntoViewIfNeeded()
        await faq.click()
        await expect(faq.locator('p')).toHaveCount(0)
        await expectNoHorizontalOverflow(page)

        const headingLines = await heading.evaluate((element) => {
          const styles = window.getComputedStyle(element)
          return Math.ceil(element.getBoundingClientRect().height / Number.parseFloat(styles.lineHeight))
        })
        expect(headingLines).toBeLessThanOrEqual(HEADING_LINE_LIMITS[viewport])
      },
    )

    test(
      `toggles the second FAQ answer at ${viewport}`,
      { tag: [...HOME_FAQ, '@outcome:success', `@viewport:${viewport}`] },
      async ({ page }, testInfo) => {
        // quality: allow-duplicate (per-viewport contract: home-faq @ ${viewport})
        await mockHomeApis(page, testInfo)
        await page.goto('/')
        await waitForPageLoad(page)

        const faq = page.getByTestId('home-faq-1')
        await faq.scrollIntoViewIfNeeded()
        await faq.click()
        await expect(faq).toContainText('Sí 🎉 Enviamos a toda Colombia')
        await expectNoHorizontalOverflow(page)
        await faq.click()
        await expect(faq.locator('p')).toHaveCount(0)
      },
    )
  })
}

for (const viewport of ['compact', 'portrait'] as const) {
  test.describe(`Home featured carousel at ${viewport}`, () => {
    test.use(viewportUse(viewport))

    test(
      `opens the second featured product at ${viewport}`,
      { tag: [...HOME_PRODUCT_CAROUSEL, '@outcome:success', `@viewport:${viewport}`] },
      async ({ page }, testInfo) => {
        // quality: allow-duplicate (per-viewport contract: home-product-carousel @ ${viewport})
        await mockHomeApis(page, testInfo)
        await page.goto('/')
        await waitForPageLoad(page)

        const carousel = page.getByTestId('home-featured-carousel')
        await carousel.scrollIntoViewIfNeeded()
        const bullet = carousel.getByRole('button', { name: 'Mostrar peluche 2' })
        const bulletBounds = await bullet.boundingBox()
        expect(bulletBounds).not.toBeNull()
        expect(bulletBounds!.width).toBeGreaterThanOrEqual(44)
        expect(bulletBounds!.height).toBeGreaterThanOrEqual(44)

        await bullet.click()
        await expect(bullet).toHaveClass(/swiper-pagination-bullet-active/)
        await carousel.getByRole('link', { name: /Abrazo artesanal especial 2/ }).click()
        await expect(page).toHaveURL(/\/peluches\/abrazo-2$/)
      },
    )
  })
}

test.describe('Home catalog entry at portrait', () => {
  test.use(viewportUse('portrait'))

  test(
    'shows four controlled catalog products after the Inicio CTA',
    { tag: [...HOME_TO_CATALOG, '@outcome:success', '@viewport:portrait'] },
    async ({ page }, testInfo) => {
      await mockHomeApis(page, testInfo)
      await mockCatalogApis(page)
      await page.goto('/')
      await waitForPageLoad(page)

      await page.getByRole('link', { name: 'Explorar catálogo' }).click()
      await expect(page).toHaveURL(/\/catalog$/)
      await expect(page.getByText('4 peluches encontrados', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: /Abrazo artesanal especial 1/ })).toBeVisible()
    },
  )
})
