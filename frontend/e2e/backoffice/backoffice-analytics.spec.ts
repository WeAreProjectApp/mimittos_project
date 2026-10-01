import { test, expect } from '../test-with-coverage'
import type { Page, Route, TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fn } from 'jest-mock'
import { waitForPageLoad } from '../fixtures'
import { BACKOFFICE_ANALYTICS_DATE_FILTER, BACKOFFICE_ANALYTICS_EXPORT_CSV } from '../helpers/flow-tags'

const mockAdmin = {
  id: 1,
  email: 'admin@mimittos.co',
  first_name: 'Admin',
  last_name: 'User',
  role: 'admin',
  is_staff: true,
  is_active: true,
}

const DATE_FROM = '2026-04-01'
const DATE_TO = '2026-04-30'
const CSV_BODY = 'order_number,status\nPELUCH-0001,delivered\n'

function dashboard(totalOrders: number, confirmedRevenue: number) {
  return {
    total_orders: totalOrders,
    confirmed_revenue: confirmedRevenue,
    orders_by_status: { delivered: totalOrders },
    top_peluches: [{ title: 'Abrazo artesanal especial', total_sold: totalOrders, slug: 'abrazo-artesanal' }],
    daily_orders: [
      { date: '2026-04-01', orders: 4, revenue: 400000 },
      { date: '2026-04-02', orders: 8, revenue: 800000 },
    ],
    new_vs_returning: { new: 7, returning: 5 },
    device_types: { mobile: 8, desktop: 3, tablet: 1 },
    traffic_sources: { direct: 6, google: 4, instagram: 2 },
  }
}

function appOrigin(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('Playwright requires project.use.baseURL for local API isolation')
  return new URL(baseURL).origin
}

async function setupStaffAuth(page: Page, testInfo: TestInfo) {
  const origin = appOrigin(testInfo)
  await page.route((url) => url.origin !== origin, (route) => route.abort())
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

async function mockDashboardApis(page: Page) {
  await page.route('**/api/analytics/kpis/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ new_orders: 4, in_production: 3, pending_dispatch: 2, confirmed_deposits: 120000 }),
    }),
  )
  await page.route('**/api/analytics/dashboard/**', (route: Route) => {
    const url = new URL(route.request().url())
    const isFilteredRange = url.searchParams.get('date_from') === DATE_FROM && url.searchParams.get('date_to') === DATE_TO
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isFilteredRange ? dashboard(12, 1200000) : dashboard(42, 4200000)),
    })
  })
}

async function openDashboard(page: Page) {
  await page.goto('/backoffice')
  await waitForPageLoad(page)
  await expect(page.getByText(/42 pedidos/)).toBeVisible()
}

async function applyAprilRange(page: Page) {
  await page.getByTestId('date-from').fill(DATE_FROM)
  await page.getByTestId('date-to').fill(DATE_TO)
  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/api/analytics/dashboard/'
      && url.searchParams.get('date_from') === DATE_FROM
      && url.searchParams.get('date_to') === DATE_TO
  })
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await filteredRequest
}

function compiledBackofficeAssets() {
  const frontendRoot = resolve(__dirname, '../..')
  const manifest = readFileSync(join(frontendRoot, '.next/server/app/backoffice/page_client-reference-manifest.js'), 'utf8')
  const entrySection = manifest.slice(manifest.indexOf('"entryJSFiles"'))
  const entryMatch = entrySection.match(/"\[project\]\/app\/backoffice\/page":\[([^\]]+)\]/)
  expect(entryMatch).not.toBeNull()
  const initialEntries = JSON.parse(`[${entryMatch![1]}]`) as string[]
  const initialAssets = initialEntries.map((entry) => join(frontendRoot, '.next', entry))

  const chunksRoot = join(frontendRoot, '.next/static/chunks')
  const chartAssets = readdirSync(chunksRoot, { recursive: true })
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => join(chunksRoot, entry))
    .filter((asset) => {
      const source = readFileSync(asset, 'utf8')
      return source.includes('Tendencia de pedidos') && source.includes('recharts-wrapper')
    })
  expect(chartAssets).toHaveLength(1)

  const chartAsset = chartAssets[0]
  const chartEntry = `static/chunks/${relative(chunksRoot, chartAsset).replaceAll('\\', '/')}`
  expect(initialEntries).not.toContain(chartEntry)

  return { initialAssets, chartAsset, chartRequestPath: `/_next/${chartEntry}` }
}

test(
  'updates analytics after applying an exact date range',
  { tag: [...BACKOFFICE_ANALYTICS_DATE_FILTER, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupStaffAuth(page, testInfo)
    await mockDashboardApis(page)
    await openDashboard(page)

    await applyAprilRange(page)

    await expect(page.getByText(/12 pedidos/)).toBeVisible()
    await expect(page.getByText('Tendencia de pedidos', { exact: true })).toBeVisible()
    // quality: allow-fragile-selector (Recharts exposes its two rendered series only through .recharts-line-curve; URL and summary assertions remain the primary behavior proof.)
    await expect(page.locator('.recharts-line-curve')).toHaveCount(2)
  },
)

test(
  'defers the chart chunk within compiled budgets',
  { tag: ['@flow:backoffice-dashboard-display', '@module:backoffice', '@priority:P2', '@outcome:display'] },
  async ({ page }, testInfo) => {
    // quality: allow-no-interaction (the observable behavior is deferred chart loading triggered by the dashboard's initial analytics response.)
    const { initialAssets, chartAsset, chartRequestPath } = compiledBackofficeAssets()
    const initialTransferBytes = initialAssets.reduce(
      (total, asset) => total + gzipSync(readFileSync(asset)).byteLength,
      0,
    )
    expect(initialTransferBytes).toBeLessThanOrEqual(300 * 1024)
    expect(gzipSync(readFileSync(chartAsset)).byteLength).toBeLessThanOrEqual(150 * 1024)

    const requests = fn()
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === chartRequestPath) requests()
    })

    await setupStaffAuth(page, testInfo)
    await page.route('**/api/analytics/kpis/**', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ new_orders: 4, in_production: 3, pending_dispatch: 2, confirmed_deposits: 120000 }),
      }),
    )

    let releaseDashboard: (() => void) | undefined
    const dashboardBarrier = new Promise<void>((resolveBarrier) => { releaseDashboard = resolveBarrier })
    let dashboardRequested: (() => void) | undefined
    const dashboardRequest = new Promise<void>((resolveRequest) => { dashboardRequested = resolveRequest })
    await page.route('**/api/analytics/dashboard/**', async (route: Route) => {
      dashboardRequested!()
      await dashboardBarrier
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard(42, 4200000)) })
    })

    await page.goto('/backoffice')
    await dashboardRequest
    await expect(page.getByText('Cargando analytics...', { exact: true })).toBeVisible()
    expect(requests.mock.calls).toHaveLength(0)

    releaseDashboard!()
    await expect(page.getByText('Tendencia de pedidos', { exact: true })).toBeVisible()
    const trendLegend = page.getByRole('list').filter({ hasText: 'Ingresos ($)' })
    await expect(trendLegend.getByText('Pedidos', { exact: true })).toBeVisible()
    await expect(trendLegend.getByText('Ingresos ($)', { exact: true })).toBeVisible()
    expect(requests.mock.calls).toHaveLength(1)
  },
)

test(
  'downloads the scoped CSV for the currently applied date range',
  { tag: [...BACKOFFICE_ANALYTICS_EXPORT_CSV, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupStaffAuth(page, testInfo)
    await mockDashboardApis(page)
    await page.route('**/api/analytics/export/orders/**', (route: Route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="orders.csv"', 'Content-Type': 'text/csv' },
        body: CSV_BODY,
      }),
    )
    await openDashboard(page)
    await applyAprilRange(page)

    const csvRequest = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.pathname === '/api/analytics/export/orders/'
        && url.searchParams.get('date_from') === DATE_FROM
        && url.searchParams.get('date_to') === DATE_TO
    })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '↓ CSV' }).click()
    const [download] = await Promise.all([downloadPromise, csvRequest])

    expect(download.suggestedFilename()).toBe('pedidos-2026-04-01.csv')
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    await expect.poll(() => readFile(downloadPath!, 'utf8')).toBe(CSV_BODY)
  },
)

test(
  'shows the export failure message when the CSV endpoint rejects the selected range',
  { tag: [...BACKOFFICE_ANALYTICS_EXPORT_CSV, '@outcome:failure'] },
  async ({ page }, testInfo) => {
    await setupStaffAuth(page, testInfo)
    await mockDashboardApis(page)
    await page.route('**/api/analytics/export/orders/**', (route: Route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'No disponible' }) }),
    )
    await openDashboard(page)
    await applyAprilRange(page)

    const dialogPromise = page.waitForEvent('dialog')
    await page.getByRole('button', { name: '↓ CSV' }).click()
    const dialog = await dialogPromise
    expect(dialog.message()).toBe('No se pudo exportar el reporte.')
    await dialog.accept()
    await expect(page.getByRole('button', { name: '↓ CSV' })).toBeEnabled()
  },
)
