import { test, expect } from '../test-with-coverage';
import type { Page, Route, TestInfo } from '@playwright/test';
import { waitForPageLoad } from '../fixtures';
import {
  BACKOFFICE_ORDER_FILTER,
  BACKOFFICE_ORDER_STATUS_UPDATE,
  BACKOFFICE_ORDER_TRACKING_UPDATE,
  BACKOFFICE_ORDER_DETAIL,
} from '../helpers/flow-tags';

const adminUser = {
  id: 99,
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'Test',
  role: 'admin',
  is_staff: true,
};

const ORDER_NUMBER = 'PELUCH-7777-DDDD';

const ordersList = [
  {
    order_number: ORDER_NUMBER,
    status: 'payment_confirmed',
    total_amount: 200000,
    deposit_amount: 100000,
    balance_amount: 100000,
    city: 'Bogotá',
    department: 'Cundinamarca',
    customer_name: 'Cliente Demo',
    customer_email: 'cliente@example.com',
    created_at: '2026-04-25T10:00:00Z',
    items: [],
  },
];

function ordersEnvelope(results: typeof ordersList) {
  return { count: results.length, next: null, previous: null, results };
}

function appOrigin(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('Playwright requires project.use.baseURL for local API isolation');
  return new URL(baseURL).origin;
}

async function setupAdminMocks(page: Page, testInfo: TestInfo) {
  const origin = appOrigin(testInfo);
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.context().addCookies([
    { name: 'access_token', value: 'mock-admin-access', domain: new URL(origin).hostname, path: '/' },
    { name: 'refresh_token', value: 'mock-admin-refresh', domain: new URL(origin).hostname, path: '/' },
  ]);
  await page.route('**/api/validate_token/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, user: adminUser }) }),
  );
  await page.route('**/api/token/refresh/', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'mock-admin-access' }) }),
  );
  await page.route('**/api/analytics/kpis/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ new_orders: 2, in_production: 1, pending_dispatch: 1, confirmed_deposits: 200000 }),
    }),
  );
  await page.route('**/api/analytics/dashboard/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_orders: 2, total_revenue: 200000, orders_by_status: [], top_peluches: [], daily_orders: [] }),
    }),
  );
  await page.route(/\/api\/orders\/list\/?(\?.*)?$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ordersEnvelope(ordersList)) }),
  );
}

async function openOrdersFromDashboard(page: Page) {
  await page.goto('/backoffice');
  await waitForPageLoad(page);
  const ordersLink = page.getByRole('navigation').getByRole('link', { name: /Pedidos/ });
  await expect(ordersLink).toHaveAttribute('href', '/backoffice/pedidos');

  await ordersLink.click();
  await expect(page).toHaveURL(/\/backoffice\/pedidos$/);
}

function createSupersededFilterRoute(initialOrders: typeof ordersList, shippedOrders: typeof ordersList) {
  let releaseProductionRoute: () => void;
  let productionRouteStarted: () => void;
  let resolveProductionFinished: () => void;
  let rejectProductionFinished: (error: unknown) => void;
  const productionStarted = new Promise<void>((resolve) => { productionRouteStarted = resolve; });
  const productionFinished = new Promise<void>((resolve, reject) => {
    resolveProductionFinished = resolve;
    rejectProductionFinished = reject;
  });
  const keepProductionPending = new Promise<void>((resolve) => { releaseProductionRoute = resolve; });

  return {
    productionStarted,
    productionFinished,
    releaseProduction: () => releaseProductionRoute(),
    handler: async (route: Route) => {
      const status = new URL(route.request().url()).searchParams.get('status');
      if (status === 'in_production') {
        productionRouteStarted();
        await keepProductionPending;
        try {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ordersEnvelope([{ ...ordersList[0], customer_name: 'Respuesta obsoleta' }])) });
          resolveProductionFinished();
        } catch (error) {
          rejectProductionFinished(error);
          throw error;
        }
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ordersEnvelope(status === 'shipped' ? shippedOrders : initialOrders)),
      });
    },
  };
}

const DETAIL_A = 'PELUCH-DETAIL-A';
const DETAIL_B = 'PELUCH-DETAIL-B';

function orderDetail(orderNumber: string, customerName: string, address: string) {
  return {
    ...ordersList[0], order_number: orderNumber, customer_name: customerName, address,
    customer_phone: '3001234567', postal_code: '', tracking_number: '', shipping_carrier: '',
    notes: '', updated_at: '2026-04-25T10:00:00Z', shipping_amount: 0, discount_amount: 0,
    payment_mode: 'deposit', amount_paid_now: 100000, status_history: [], payment: null,
  };
}

async function setupDetailMocks(page: Page, testInfo: TestInfo) {
  await setupAdminMocks(page, testInfo);
  await page.unroute(/\/api\/orders\/list\/?(\?.*)?$/);
  await page.route(/\/api\/orders\/list\/?(\?.*)?$/, (route) => route.fulfill({ json: ordersEnvelope([
    { ...ordersList[0], order_number: DETAIL_A, customer_name: 'Cliente A' },
    { ...ordersList[0], order_number: DETAIL_B, customer_name: 'Cliente B' },
  ]) }));
}

async function holdDetailResponse(page: Page, orderNumber: string, detail: ReturnType<typeof orderDetail>) {
  const path = `/api/orders/${orderNumber}/`;
  let markStarted!: () => void;
  let release!: (status: number) => void;
  let markCompleted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const responseStatus = new Promise<number>((resolve) => { release = resolve; });
  const completed = new Promise<void>((resolve) => { markCompleted = resolve; });
  await page.route(`**${path}`, async (route) => {
    markStarted();
    const status = await responseStatus;
    await route.fulfill({ status, json: status === 200 ? detail : { detail: 'detail unavailable' } });
    markCompleted();
  });
  return {
    started,
    finish: async (status = 200) => {
      const finished = page.waitForEvent('requestfinished', {
        predicate: (request) => new URL(request.url()).pathname === path,
      });
      release(status);
      await Promise.all([completed, finished]);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
    },
  };
}

// Fails if a closed order's late response installs its customer under the current order heading.
test('keeps the current order detail after the closed order responds',
  { tag: [...BACKOFFICE_ORDER_DETAIL, '@outcome:success'] }, async ({ page }, testInfo) => {
    await setupDetailMocks(page, testInfo);
    const oldResponse = await holdDetailResponse(page, DETAIL_A, orderDetail(DETAIL_A, 'Cliente A antiguo', 'Dirección A antigua'));
    await page.route(`**/api/orders/${DETAIL_B}/`, (route) =>
      route.fulfill({ json: orderDetail(DETAIL_B, 'Cliente B vigente', 'Dirección B vigente') }));
    await openOrdersFromDashboard(page);
    await page.getByTestId(`order-row-${DETAIL_A}`).click();
    await oldResponse.started;
    await page.getByRole('dialog', { name: `Detalle del pedido ${DETAIL_A}` }).getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByTestId(`order-row-${DETAIL_B}`).click();
    const dialog = page.getByRole('dialog', { name: `Detalle del pedido ${DETAIL_B}` });
    await expect(dialog.getByText('Dirección B vigente', { exact: true })).toBeVisible();

    await oldResponse.finish();

    await expect(dialog.getByText('Cliente B vigente', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Dirección B vigente', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Cliente A antiguo', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Dirección A antigua', { exact: true })).toHaveCount(0);
  });

// Fails if an obsolete rejection ends the current order's loading state or installs its error.
test('keeps the current detail loading after the closed order fails',
  { tag: [...BACKOFFICE_ORDER_DETAIL, '@outcome:success'] }, async ({ page }, testInfo) => {
    await setupDetailMocks(page, testInfo);
    const oldResponse = await holdDetailResponse(page, DETAIL_A, orderDetail(DETAIL_A, 'Cliente A antiguo', 'Dirección A antigua'));
    const currentResponse = await holdDetailResponse(page, DETAIL_B, orderDetail(DETAIL_B, 'Cliente B vigente', 'Dirección B vigente'));
    await openOrdersFromDashboard(page);
    await page.getByTestId(`order-row-${DETAIL_A}`).click();
    await oldResponse.started;
    await page.getByRole('dialog', { name: `Detalle del pedido ${DETAIL_A}` }).getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByTestId(`order-row-${DETAIL_B}`).click();
    await currentResponse.started;
    const dialog = page.getByRole('dialog', { name: `Detalle del pedido ${DETAIL_B}` });

    await oldResponse.finish(500);

    await expect(dialog.getByText('Cargando detalle…', { exact: true })).toBeVisible();
    await expect(dialog.getByText('No se pudo cargar el detalle del pedido.', { exact: true })).toHaveCount(0);
    await currentResponse.finish();
    await expect(dialog.getByText('Cliente B vigente', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Dirección B vigente', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Cargando detalle…', { exact: true })).toHaveCount(0);
  });

// Fails if the current request's error is suppressed by the stale-response guard.
test('shows the current order detail failure in its closable dialog',
  { tag: [...BACKOFFICE_ORDER_DETAIL, '@outcome:failure'] }, async ({ page }, testInfo) => {
    await setupDetailMocks(page, testInfo);
    await page.route(`**/api/orders/${DETAIL_A}/`, (route) =>
      route.fulfill({ json: orderDetail(DETAIL_A, 'Cliente A anterior', 'Dirección A anterior') }));
    await page.route(`**/api/orders/${DETAIL_B}/`, (route) =>
      route.fulfill({ status: 500, json: { detail: 'detail unavailable' } }));
    await openOrdersFromDashboard(page);
    await page.getByTestId(`order-row-${DETAIL_A}`).click();
    const firstDialog = page.getByRole('dialog', { name: `Detalle del pedido ${DETAIL_A}` });
    await expect(firstDialog.getByText('Dirección A anterior', { exact: true })).toBeVisible();
    await firstDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByTestId(`order-row-${DETAIL_B}`).click();
    const dialog = page.getByRole('dialog', { name: `Detalle del pedido ${DETAIL_B}` });

    await expect(dialog.getByText('No se pudo cargar el detalle del pedido.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Cargando detalle…', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Cliente A anterior', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Dirección A anterior', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

// Fails if a staff status change no longer reaches the server or updates its row.
test(
  'should send PATCH /status when staff changes order status select',
  { tag: [...BACKOFFICE_ORDER_STATUS_UPDATE, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupAdminMocks(page, testInfo);

    const statusRequest = page.waitForRequest(
      (req) => req.url().includes(`/api/orders/${ORDER_NUMBER}/status/`) && req.method() === 'PATCH',
    );

    await page.route(`**/api/orders/${ORDER_NUMBER}/status/`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );

    await page.goto('/backoffice/pedidos');
    await waitForPageLoad(page);

    await expect(page.getByText(ORDER_NUMBER)).toBeVisible();

    const row = page.getByTestId(`order-row-${ORDER_NUMBER}`);
    await row.getByRole('combobox').selectOption('in_production');

    const sent = await statusRequest;
    const body = sent.postDataJSON() as Record<string, unknown>;
    expect(body.status).toBe('in_production');
    await expect(row.getByRole('combobox')).toHaveValue('in_production');
  },
);

// Fails if a successful tracking update leaves the submitted guide in the editable input.
test(
  'should send PATCH /tracking when staff submits a tracking number',
  { tag: [...BACKOFFICE_ORDER_TRACKING_UPDATE, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupAdminMocks(page, testInfo);

    const trackingRequest = page.waitForRequest(
      (req) => req.url().includes(`/api/orders/${ORDER_NUMBER}/tracking/`) && req.method() === 'PATCH',
    );

    await page.route(`**/api/orders/${ORDER_NUMBER}/tracking/`, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );

    await page.goto('/backoffice/pedidos');
    await waitForPageLoad(page);

    await expect(page.getByText(ORDER_NUMBER)).toBeVisible();

    const row = page.getByTestId(`order-row-${ORDER_NUMBER}`);
    await row.getByPlaceholder('Guía...').fill('SERVI-9988');
    await row.getByRole('button', { name: '✓' }).click();

    const sent = await trackingRequest;
    const body = sent.postDataJSON() as Record<string, unknown>;
    expect(body.tracking_number).toBe('SERVI-9988');
    await expect(row.getByPlaceholder('Guía...')).toHaveValue('');
  },
);

// Fails if a canceled status request can replace the table after a newer selection finishes.
test(
  'keeps the latest status-filtered orders after the previous request is aborted',
  { tag: [...BACKOFFICE_ORDER_FILTER, '@outcome:success'] },
  async ({ page }, testInfo) => {
    await setupAdminMocks(page, testInfo);

    const initialOrders = [
      { ...ordersList[0], order_number: 'PELUCH-INITIAL-0001', customer_name: 'Pedido inicial' },
    ];
    const shippedOrders = [
      { ...ordersList[0], order_number: 'PELUCH-SHIPPED-0002', status: 'shipped', customer_name: 'Pedido vigente' },
    ];
    const routeState = createSupersededFilterRoute(initialOrders, shippedOrders);

    await page.unroute(/\/api\/orders\/list\/?(\?.*)?$/);
    await page.route(/\/api\/orders\/list\/?(\?.*)?$/, routeState.handler);

    await openOrdersFromDashboard(page);
    await expect(page.getByTestId('order-row-PELUCH-INITIAL-0001')).toContainText('Pedido inicial');

    await page.getByRole('button', { name: 'En producción', exact: true }).click();
    await routeState.productionStarted;

    const abortedProduction = page.waitForEvent('requestfailed', {
      predicate: (request) => new URL(request.url()).pathname.endsWith('/api/orders/list/')
        && new URL(request.url()).searchParams.get('status') === 'in_production',
    });
    await page.getByRole('button', { name: 'Despachado', exact: true }).click();
    await abortedProduction;
    routeState.releaseProduction();
    await routeState.productionFinished;

    await expect(page.getByTestId('order-row-PELUCH-SHIPPED-0002')).toContainText('Pedido vigente');
    await expect(page.getByTestId('order-row-PELUCH-INITIAL-0001')).toHaveCount(0);
  },
);

// Fails if a server failure after selecting a status is hidden from the staff member.
test(
  'shows a visible error when the selected status filter request fails',
  { tag: [...BACKOFFICE_ORDER_FILTER, '@outcome:failure'] },
  async ({ page }, testInfo) => {
    await setupAdminMocks(page, testInfo);

    await page.unroute(/\/api\/orders\/list\/?(\?.*)?$/);
    await page.route(/\/api\/orders\/list\/?(\?.*)?$/, (route: Route) => {
      const status = new URL(route.request().url()).searchParams.get('status');
      if (status === 'in_production') {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'backend unavailable' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ordersEnvelope(ordersList)) });
    });

    await openOrdersFromDashboard(page);
    await expect(page.getByTestId(`order-row-${ORDER_NUMBER}`)).toContainText('Cliente Demo');

    await page.getByRole('button', { name: 'En producción', exact: true }).click();
    await expect(page.getByText('No se pudieron cargar los pedidos.', { exact: true })).toHaveText('No se pudieron cargar los pedidos.');
    await expect(page.getByText('Cargando...', { exact: true })).toHaveCount(0);
  },
);
