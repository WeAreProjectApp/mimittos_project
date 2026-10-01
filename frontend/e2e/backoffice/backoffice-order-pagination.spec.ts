import { test, expect } from '../test-with-coverage'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'
import { waitForPageLoad } from '../fixtures'
import { BACKOFFICE_ORDER_PAGINATION } from '../helpers/flow-tags'
import { viewportUse, type ViewportAlias } from '../helpers/viewports'

const PAGE_ONE = 'P1-ORDER-100'
const PAGE_TWO = 'P2-ORDER-200'
const VIEWPORTS: ViewportAlias[] = ['compact', 'portrait', 'landscape', 'desktop', 'wide']

function order(orderNumber: string, status = 'payment_confirmed') {
  return {
    id: orderNumber === PAGE_ONE ? 1 : 2,
    order_number: orderNumber,
    customer_name: `Cliente ${orderNumber}`,
    customer_email: `${orderNumber.toLowerCase()}@example.com`,
    city: 'Bogotá',
    department: 'Cundinamarca',
    status,
    total_amount: 200000,
    deposit_amount: 100000,
    balance_amount: 100000,
    shipping_amount: 0,
    discount_amount: 0,
    payment_mode: 'deposit',
    amount_paid_now: 100000,
    created_at: '2026-10-01T10:00:00Z',
  }
}

const pageOneOrder = order(PAGE_ONE)
const pageTwoOrder = order(PAGE_TWO)

function envelope(results: ReturnType<typeof order>[], page: number) {
  return {
    count: 300,
    next: page < 3 ? `https://mock.invalid/api/orders/list/?page=${page + 1}` : null,
    previous: page > 1 ? `https://mock.invalid/api/orders/list/?page=${page - 1}` : null,
    results,
  }
}

function appOrigin(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('Playwright requires project.use.baseURL for local API isolation')
  return new URL(baseURL).origin
}

async function setupStaff(page: Page, testInfo: TestInfo, listHandler: (route: Route) => Promise<void> | void) {
  const origin = appOrigin(testInfo)
  await page.route((url) => url.origin !== origin, (route) => route.abort())
  await page.context().addCookies([
    { name: 'access_token', value: 'pagination-admin-access', domain: new URL(origin).hostname, path: '/' },
    { name: 'refresh_token', value: 'pagination-admin-refresh', domain: new URL(origin).hostname, path: '/' },
  ])
  await page.route('**/api/validate_token/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, user: { id: 1, email: 'admin@example.com', first_name: 'Admin', last_name: 'Test', role: 'admin', is_staff: true } }) }),
  )
  await page.route('**/api/token/refresh/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'pagination-admin-access' }) }),
  )
  await page.route('**/api/analytics/kpis/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ new_orders: 1, in_production: 1, pending_dispatch: 0, confirmed_deposits: 100000 }) }),
  )
  await page.route('**/api/analytics/dashboard/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_orders: 1, confirmed_revenue: 100000, orders_by_status: {}, top_peluches: [], daily_orders: [] }) }),
  )
  await page.route(/\/api\/orders\/list\/?(\?.*)?$/, listHandler)
}

function pageHandler(route: Route) {
  const requestUrl = new URL(route.request().url())
  const page = Number(requestUrl.searchParams.get('page'))
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(page === 2 ? envelope([pageTwoOrder], 2) : envelope([pageOneOrder], 1)),
  })
}

async function openOrders(page: Page) {
  await page.goto('/backoffice/pedidos')
  await waitForPageLoad(page)
  await expect(page.getByTestId(`order-row-${PAGE_ONE}`)).toContainText(`Cliente ${PAGE_ONE}`)
}

async function openPageTwo(page: Page) {
  const nextRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/api/orders/list/' && url.searchParams.get('page') === '2' && url.searchParams.get('page_size') === '100'
  })
  await page.getByRole('button', { name: 'Página siguiente' }).click()
  await nextRequest
  await expect(page.getByTestId(`order-row-${PAGE_TWO}`)).toContainText(`Cliente ${PAGE_TWO}`)
}

async function controlBounds(control: Locator) {
  return control.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight }
  })
}

for (const viewport of VIEWPORTS) {
  test.describe(`pagination next at ${viewport}`, () => {
    test.use(viewportUse(viewport))

    // Fails if page two is not requested, replaces no rows, or exposes inaccessible controls at this width.
    test(
      `loads page two with reachable 44px controls at ${viewport} @viewport:${viewport}`,
      { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success', `@viewport:${viewport}`] },
      async ({ page }, testInfo) => {
        // quality: allow-duplicate (per-viewport contract: backoffice-order-pagination next at the prescribed responsive width)
        await setupStaff(page, testInfo, pageHandler)
        await openOrders(page)

        const navigation = page.getByRole('navigation', { name: 'Paginación de pedidos' })
        await navigation.scrollIntoViewIfNeeded()
        const previous = page.getByRole('button', { name: 'Página anterior' })
        const next = page.getByRole('button', { name: 'Página siguiente' })
        const nextRequest = page.waitForRequest((request) => {
          const url = new URL(request.url())
          return url.pathname === '/api/orders/list/' && url.searchParams.get('page') === '2' && url.searchParams.get('page_size') === '100'
        })
        await next.click()
        await nextRequest

        await expect(page.getByText('Página 2 de 3', { exact: true })).toHaveText('Página 2 de 3')
        await expect(page.getByTestId(`order-row-${PAGE_TWO}`)).toContainText(`Cliente ${PAGE_TWO}`)
        await expect(page.getByTestId(`order-row-${PAGE_ONE}`)).toHaveCount(0)
        const previousBounds = await controlBounds(previous)
        expect(previousBounds.width).toBeGreaterThanOrEqual(44)
        expect(previousBounds.height).toBeGreaterThanOrEqual(44)
        expect(previousBounds.top).toBeGreaterThanOrEqual(0)
        expect(previousBounds.bottom).toBeLessThanOrEqual(previousBounds.viewportHeight)
        const nextBounds = await controlBounds(next)
        expect(nextBounds.width).toBeGreaterThanOrEqual(44)
        expect(nextBounds.height).toBeGreaterThanOrEqual(44)
        expect(nextBounds.top).toBeGreaterThanOrEqual(0)
        expect(nextBounds.bottom).toBeLessThanOrEqual(nextBounds.viewportHeight)
      },
    )
  })

  test.describe(`pagination previous at ${viewport}`, () => {
    test.use(viewportUse(viewport))

    // Fails if returning from page two retains page-two rows or asks for the wrong page.
    test(
      `returns to page one at ${viewport} @viewport:${viewport}`,
      { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success', `@viewport:${viewport}`] },
      async ({ page }, testInfo) => {
        // quality: allow-duplicate (per-viewport contract: backoffice-order-pagination previous at the prescribed responsive width)
        await setupStaff(page, testInfo, pageHandler)
        await openOrders(page)
        await openPageTwo(page)

        const previousRequest = page.waitForRequest((request) => {
          const url = new URL(request.url())
          return url.pathname === '/api/orders/list/' && url.searchParams.get('page') === '1' && url.searchParams.get('page_size') === '100'
        })
        await page.getByRole('button', { name: 'Página anterior' }).click()
        await previousRequest

        await expect(page.getByText('Página 1 de 3', { exact: true })).toHaveText('Página 1 de 3')
        await expect(page.getByTestId(`order-row-${PAGE_ONE}`)).toContainText(`Cliente ${PAGE_ONE}`)
        await expect(page.getByTestId(`order-row-${PAGE_TWO}`)).toHaveCount(0)
      },
    )
  })
}

// Fails if a status filter keeps page two or issues duplicate current requests.
test(
  'resets the orders filter to page one from page two',
  { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success'] },
  async ({ page }, testInfo) => {
    let filteredRequests = 0
    await setupStaff(page, testInfo, (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('status') === 'in_production') {
        filteredRequests += 1
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([order('FILTERED-P1-300', 'in_production')], 1)) })
      }
      return pageHandler(route)
    })
    await openOrders(page)
    await openPageTwo(page)

    const filteredRequest = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.pathname === '/api/orders/list/'
        && url.searchParams.get('status') === 'in_production'
        && url.searchParams.get('page') === '1'
        && url.searchParams.get('page_size') === '100'
    })
    await page.getByRole('button', { name: 'En producción', exact: true }).click()
    await filteredRequest

    expect(filteredRequests).toBe(1)
    await expect(page.getByText('Página 1 de 3', { exact: true })).toHaveText('Página 1 de 3')
    await expect(page.getByTestId('order-row-FILTERED-P1-300')).toContainText('Cliente FILTERED-P1-300')
    await expect(page.getByTestId(`order-row-${PAGE_TWO}`)).toHaveCount(0)
  },
)

// Fails if page navigation drops the selected status filter and displays an unfiltered second page.
test(
  'keeps the active status filter while loading its second page',
  { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success'] },
  async ({ page }, testInfo) => {
    const filteredPageOne = order('FILTERED-P1-400', 'in_production')
    const filteredPageTwo = order('FILTERED-P2-500', 'in_production')
    await setupStaff(page, testInfo, (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('status') === 'in_production') {
        const pageNumber = Number(url.searchParams.get('page'))
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(envelope(pageNumber === 2 ? [filteredPageTwo] : [filteredPageOne], pageNumber)),
        })
      }
      return pageHandler(route)
    })
    await openOrders(page)

    await page.getByRole('button', { name: 'En producción', exact: true }).click()
    await expect(page.getByTestId('order-row-FILTERED-P1-400')).toContainText('Cliente FILTERED-P1-400')
    const filteredNextRequest = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.pathname === '/api/orders/list/'
        && url.searchParams.get('status') === 'in_production'
        && url.searchParams.get('page') === '2'
        && url.searchParams.get('page_size') === '100'
    })
    await page.getByRole('button', { name: 'Página siguiente' }).click()
    await filteredNextRequest

    await expect(page.getByText('Página 2 de 3', { exact: true })).toHaveText('Página 2 de 3')
    await expect(page.getByTestId('order-row-FILTERED-P2-500')).toContainText('Cliente FILTERED-P2-500')
    await expect(page.getByTestId('order-row-FILTERED-P1-400')).toHaveCount(0)
  },
)

// Fails if a failed page change leaves stale data, an empty-state lie, or usable pagination controls.
test(
  'clears page-one rows after the page-two request fails',
  { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:failure'] },
  async ({ page }, testInfo) => {
    await setupStaff(page, testInfo, (route) => {
      const pageNumber = new URL(route.request().url()).searchParams.get('page')
      if (pageNumber === '2') {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'page two unavailable' }) })
      }
      return pageHandler(route)
    })
    await openOrders(page)

    await page.getByRole('button', { name: 'Página siguiente' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'No se pudieron cargar los pedidos.' })).toHaveText('No se pudieron cargar los pedidos.')
    await expect(page.getByTestId(`order-row-${PAGE_ONE}`)).toHaveCount(0)
    await expect(page.getByText('Sin pedidos', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
  },
)

// Fails if a status update on a paginated row stops calling its matching PATCH endpoint.
test(
  'updates the status of an order shown on page two',
  { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupStaff(page, testInfo, pageHandler)
    await page.route(`**/api/orders/${PAGE_TWO}/status/`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pageTwoOrder, status: 'in_production' }) }),
    )
    await openOrders(page)
    await openPageTwo(page)

    const statusRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/orders/${PAGE_TWO}/status/`)
    const row = page.getByTestId(`order-row-${PAGE_TWO}`)
    await row.getByRole('combobox').selectOption('in_production')
    const request = await statusRequest

    expect(request.postDataJSON()).toMatchObject({ status: 'in_production' })
    await expect(row.getByRole('combobox')).toHaveValue('in_production')
  },
)

// Fails if a tracking update on a paginated row targets the wrong order or leaves submitted text behind.
test(
  'updates the tracking number of an order shown on page two',
  { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupStaff(page, testInfo, pageHandler)
    await page.route(`**/api/orders/${PAGE_TWO}/tracking/`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pageTwoOrder, tracking_number: 'SERVI-9988' }) }),
    )
    await openOrders(page)
    await openPageTwo(page)

    const trackingRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/orders/${PAGE_TWO}/tracking/`)
    const row = page.getByTestId(`order-row-${PAGE_TWO}`)
    await row.getByPlaceholder('Guía...').fill('SERVI-9988')
    await row.getByRole('button', { name: '✓' }).click()
    const request = await trackingRequest

    expect(request.postDataJSON()).toMatchObject({ tracking_number: 'SERVI-9988' })
    await expect(row.getByPlaceholder('Guía...')).toHaveValue('')
  },
)

// Fails if a page-two row opens the wrong detail request or does not expose the returned order data.
test(
  'opens the concrete detail for an order shown on page two',
  { tag: [...BACKOFFICE_ORDER_PAGINATION, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupStaff(page, testInfo, pageHandler)
    await page.route(`**/api/orders/${PAGE_TWO}/`, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...pageTwoOrder,
          customer_phone: '300 555 0101',
          address: 'Calle 42 # 10-20',
          postal_code: '110111',
          tracking_number: '',
          shipping_carrier: '',
          notes: '',
          updated_at: '2026-10-01T10:10:00Z',
          items: [],
          status_history: [],
          payment: null,
        }),
      }),
    )
    await openOrders(page)
    await openPageTwo(page)

    const detailRequest = page.waitForRequest((request) => request.method() === 'GET' && new URL(request.url()).pathname === `/api/orders/${PAGE_TWO}/`)
    await page.getByTestId(`order-row-${PAGE_TWO}`).click()
    await detailRequest

    const dialog = page.getByRole('dialog', { name: `Detalle del pedido ${PAGE_TWO}` })
    await expect(dialog.getByRole('heading', { name: `Pedido ${PAGE_TWO}` })).toHaveText(`Pedido ${PAGE_TWO}`)
    await expect(dialog.getByText('Calle 42 # 10-20', { exact: true })).toHaveText('Calle 42 # 10-20')
  },
)
