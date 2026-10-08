import { test, expect } from '../test-with-coverage'
import type { Page, TestInfo } from '@playwright/test'
import { BACKOFFICE_NAVIGATION } from '../helpers/flow-tags'
import { viewportUse, VIEWPORTS } from '../helpers/viewports'

const NAVIGATION_LABELS = [/Dashboard/, /Pedidos/, /Peluches/, /Categorías/, /Usuarios/, /Configuración/]
const ORDER_NUMBER = 'MIM-NAV-001'
const CUSTOMER_NAME = 'María Navegación'

async function openDashboard(page: Page, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('Backoffice navigation requires a local baseURL')
  const origin = new URL(baseURL).origin
  await page.route((url) => url.origin !== origin, (route) => route.abort())
  await page.context().addCookies(['access_token', 'refresh_token'].map((name) => ({
    name, value: 'navigation-admin-fixture', domain: new URL(origin).hostname, path: '/',
  })))
  const responses: Record<string, unknown> = {
    '/api/validate_token/': { valid: true, user: { id: 1, email: 'navigation@example.com', first_name: 'Admin', last_name: 'Test', role: 'admin', is_staff: true } },
    '/api/analytics/kpis/': { new_orders: 1, in_production: 0, pending_dispatch: 0, confirmed_deposits: 0 },
    '/api/analytics/dashboard/': { total_orders: 1, confirmed_revenue: 0, orders_by_status: {}, top_peluches: [], daily_orders: [] },
    '/api/orders/list/': {
      count: 1, next: null, previous: null,
      results: [{ id: 1, order_number: ORDER_NUMBER, customer_name: CUSTOMER_NAME, customer_email: 'maria@example.com', city: 'Bogotá', status: 'payment_confirmed', total_amount: 200000, deposit_amount: 100000, created_at: '2026-10-08T10:00:00Z' }],
    },
  }
  await page.route(`${origin}/api/**`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(responses[new URL(route.request().url()).pathname] ?? {}),
  }))
  await page.goto('/backoffice')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
}

async function shellGeometry(page: Page) {
  return page.locator('main').evaluate((main) => ({
    contentLeft: main.getBoundingClientRect().left,
    documentFits: document.documentElement.scrollWidth <= window.innerWidth,
    overlayVisible: [...document.querySelectorAll('aside ~ div, div.fixed.inset-0')].some((element) =>
      element.classList.contains('bg-black/40') && getComputedStyle(element).display !== 'none'),
  }))
}

for (const viewport of ['compact', 'portrait'] as const) {
  test.describe(`backoffice drawer at ${viewport}`, () => {
    test.use(viewportUse(viewport))

    // Fails if the desktop sidebar hides the drawer opener before landscape.
    test(`opens orders from the drawer at ${viewport}`, {
      tag: [...BACKOFFICE_NAVIGATION, '@outcome:success', `@viewport:${viewport}`],
    }, async ({ page }, testInfo) => {
      // quality: allow-duplicate (navigation contract at each prescribed drawer viewport)
      await openDashboard(page, testInfo)
      const opener = page.getByRole('button', { name: 'Abrir menú', exact: true })
      await expect(opener).toBeVisible()

      await opener.click()
      const sidebar = page.locator('aside')
      await expect(sidebar.getByRole('navigation').getByRole('link')).toHaveText(NAVIGATION_LABELS)
      await sidebar.getByRole('link', { name: /Pedidos/ }).click()

      await expect(page).toHaveURL(/\/backoffice\/pedidos$/)
      await expect(page.getByTestId(`order-row-${ORDER_NUMBER}`)).toContainText(CUSTOMER_NAME)
      await expect(sidebar).not.toBeInViewport()
      expect(await shellGeometry(page)).toEqual({ contentLeft: 0, documentFits: true, overlayVisible: false })
    })

    // Fails if the drawer overlay stays open when the user taps outside.
    test(`dismisses the drawer outside its links at ${viewport}`, {
      tag: [...BACKOFFICE_NAVIGATION, '@outcome:success', `@viewport:${viewport}`],
    }, async ({ page }, testInfo) => {
      // quality: allow-duplicate (dismissal contract at each prescribed drawer viewport)
      await openDashboard(page, testInfo)
      await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
      await expect(page.locator('aside')).toBeInViewport()

      await page.mouse.click(VIEWPORTS[viewport].width - 20, 100)

      await expect(page.locator('aside')).not.toBeInViewport()
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
      expect(await shellGeometry(page)).toEqual({ contentLeft: 0, documentFits: true, overlayVisible: false })
    })
  })
}

for (const viewport of ['landscape', 'desktop', 'wide'] as const) {
  test.describe(`backoffice fixed sidebar at ${viewport}`, () => {
    test.use(viewportUse(viewport))

    // Fails if aligning the drawer breakpoint hides or overlaps desktop navigation.
    test(`opens orders from the fixed sidebar at ${viewport}`, {
      tag: [...BACKOFFICE_NAVIGATION, '@outcome:success', `@viewport:${viewport}`],
    }, async ({ page }, testInfo) => {
      // quality: allow-duplicate (navigation contract at each prescribed fixed-sidebar viewport)
      await openDashboard(page, testInfo)
      const sidebar = page.locator('aside')
      await expect(sidebar).toBeInViewport()
      await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeHidden()
      await expect(sidebar.getByRole('navigation').getByRole('link')).toHaveText(NAVIGATION_LABELS)

      await sidebar.getByRole('link', { name: /Pedidos/ }).click()

      await expect(page).toHaveURL(/\/backoffice\/pedidos$/)
      await expect(page.getByTestId(`order-row-${ORDER_NUMBER}`)).toContainText(CUSTOMER_NAME)
      expect(await shellGeometry(page)).toEqual({ contentLeft: 220, documentFits: true, overlayVisible: false })
    })
  })
}

test.describe('backoffice navigation after rotation', () => {
  test.use(viewportUse('portrait'))

  // Fails if drawer state leaves an overlay or fixed content offset after rotation.
  test('navigates after returning from landscape to portrait', {
    tag: [...BACKOFFICE_NAVIGATION, '@outcome:success', '@viewport:portrait', '@viewport:landscape'],
  }, async ({ page }, testInfo) => {
    await openDashboard(page, testInfo)
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()

    await page.setViewportSize(VIEWPORTS.landscape)
    await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeHidden()
    await expect(page.locator('aside')).toBeInViewport()
    expect(await shellGeometry(page)).toEqual({ contentLeft: 220, documentFits: true, overlayVisible: false })
    await page.locator('aside').getByRole('link', { name: /Dashboard/ }).click()
    await page.setViewportSize(VIEWPORTS.portrait)
    await expect(page.locator('aside')).not.toBeInViewport()

    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
    await page.locator('aside').getByRole('link', { name: /Pedidos/ }).click()

    await expect(page).toHaveURL(/\/backoffice\/pedidos$/)
    await expect(page.getByTestId(`order-row-${ORDER_NUMBER}`)).toContainText(CUSTOMER_NAME)
    expect(await shellGeometry(page)).toEqual({ contentLeft: 0, documentFits: true, overlayVisible: false })
  })
})
