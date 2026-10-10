import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../lib/services/http', () => ({
  api: { get: jest.fn() },
}))

jest.mock('recharts', () => ({
  LineChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

import { api } from '../../../lib/services/http'
import BackofficePage from '../page'

const mockApi = api as jest.Mocked<typeof api>
const appliedAnalytics = {
  total_orders: 9,
  confirmed_revenue: 123000,
  daily_orders: [],
  top_peluches: [],
  new_vs_returning: { new: 0, returning: 0 },
  device_types: { mobile: 0, desktop: 0, tablet: 0 },
  traffic_sources: {},
  orders_by_status: {},
}
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function deferredAnalytics() {
  let resolve!: (value: { data: typeof appliedAnalytics }) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<{ data: typeof appliedAnalytics }>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function queueAnalytics(...requests: ReturnType<typeof deferredAnalytics>[]) {
  const dashboardRequests = [...requests]
  mockApi.get.mockImplementation((url) => {
    if (url === '/analytics/dashboard/') return dashboardRequests.shift()!.promise
    return Promise.resolve({ data: null })
  })
}

async function resolveAnalytics(request: ReturnType<typeof deferredAnalytics>, totalOrders: number) {
  await act(async () => {
    request.resolve({ data: { ...appliedAnalytics, total_orders: totalOrders } })
    await request.promise
  })
}

async function rejectAnalytics(request: ReturnType<typeof deferredAnalytics>) {
  await act(async () => {
    request.reject(new Error('Analytics unavailable'))
    await request.promise.catch(() => {})
  })
}

function applyPeriod(from = '2026-04-01', to = '2026-04-30') {
  fireEvent.change(screen.getByTestId('date-from'), { target: { value: from } })
  fireEvent.change(screen.getByTestId('date-to'), { target: { value: to } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
}

describe('BackofficeDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.get.mockResolvedValue({ data: null })
    URL.createObjectURL = jest.fn().mockReturnValue('blob:dashboard-export')
    URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    jest.restoreAllMocks()
  })

  it('renders the Dashboard h1 heading', () => {
    render(<BackofficePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders quick links to all backoffice sections', () => {
    render(<BackofficePage />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/backoffice/pedidos')
    expect(hrefs).toContain('/backoffice/peluches')
    expect(hrefs).toContain('/backoffice/categorias')
    expect(hrefs).toContain('/backoffice/usuarios')
  })

  it('shows loading metrics state initially', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}))
    render(<BackofficePage />)
    expect(screen.getByText('Cargando métricas...')).toBeInTheDocument()
  })

  it('shows KPI cards after metrics load', async () => {
    mockApi.get.mockResolvedValue({
      data: { new_orders: 5, in_production: 3, pending_dispatch: 2, confirmed_deposits: 150000 },
    })
    render(<BackofficePage />)
    await waitFor(() => {
      expect(screen.getByText('Pedidos nuevos hoy')).toBeInTheDocument()
    })
  })

  it('reloads analytics with the dates the staff applies', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: appliedAnalytics })
    const user = userEvent.setup()
    render(<BackofficePage />)
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2))

    await user.clear(screen.getByTestId('date-from'))
    await user.type(screen.getByTestId('date-from'), '2026-04-01')
    await user.clear(screen.getByTestId('date-to'))
    await user.type(screen.getByTestId('date-to'), '2026-04-30')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))

    // Fails if applying a period leaves the real analytics request on its initial dates.
    expect(await screen.findByText('9 pedidos · $123.000 en abonos confirmados')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenLastCalledWith('/analytics/dashboard/', {
      params: { date_from: '2026-04-01', date_to: '2026-04-30' },
    })
  })

  it('keeps the latest period after an older successful response arrives', async () => {
    const older = deferredAnalytics()
    const latest = deferredAnalytics()
    queueAnalytics(older, latest)
    render(<BackofficePage />)
    applyPeriod()

    await resolveAnalytics(latest, 12)
    await resolveAnalytics(older, 42)

    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
    expect(screen.queryByText('42 pedidos · $123.000 en abonos confirmados')).not.toBeInTheDocument()
  })

  it('keeps loading the latest period when an older response succeeds', async () => {
    const older = deferredAnalytics()
    const latest = deferredAnalytics()
    queueAnalytics(older, latest)
    render(<BackofficePage />)
    applyPeriod()

    await resolveAnalytics(older, 42)

    expect(screen.getByText('Cargando analytics...')).toBeVisible()
    expect(screen.queryByText('42 pedidos · $123.000 en abonos confirmados')).not.toBeInTheDocument()
    await resolveAnalytics(latest, 12)
    expect(screen.queryByText('Cargando analytics...')).not.toBeInTheDocument()
    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
  })

  it('keeps loading the latest period when an older response fails', async () => {
    const older = deferredAnalytics()
    const latest = deferredAnalytics()
    queueAnalytics(older, latest)
    render(<BackofficePage />)
    applyPeriod()

    await rejectAnalytics(older)

    expect(screen.getByText('Cargando analytics...')).toBeVisible()
    await resolveAnalytics(latest, 12)
    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
  })

  it('preserves the latest result after an older response fails', async () => {
    const older = deferredAnalytics()
    const latest = deferredAnalytics()
    queueAnalytics(older, latest)
    render(<BackofficePage />)
    applyPeriod()
    await resolveAnalytics(latest, 12)

    await rejectAnalytics(older)

    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
    expect(screen.queryByText('Cargando analytics...')).not.toBeInTheDocument()
  })

  it('retains the accepted fallback after the latest period fails', async () => {
    const accepted = deferredAnalytics()
    const older = deferredAnalytics()
    const latest = deferredAnalytics()
    queueAnalytics(accepted, older, latest)
    render(<BackofficePage />)
    await resolveAnalytics(accepted, 9)
    applyPeriod()
    applyPeriod('2026-05-01', '2026-05-31')

    await rejectAnalytics(latest)
    await resolveAnalytics(older, 42)

    expect(screen.getByText('9 pedidos · $123.000 en abonos confirmados')).toBeVisible()
    expect(screen.queryByText('Cargando analytics...')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ends the initial loading without inventing analytics after failure', async () => {
    const initial = deferredAnalytics()
    queueAnalytics(initial)
    render(<BackofficePage />)

    await rejectAnalytics(initial)

    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
    expect(screen.queryByText('Cargando analytics...')).not.toBeInTheDocument()
    expect(screen.queryByText(/pedidos ·/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('accepts a newly applied period after a request fails', async () => {
    const initial = deferredAnalytics()
    const retry = deferredAnalytics()
    queueAnalytics(initial, retry)
    render(<BackofficePage />)
    await rejectAnalytics(initial)

    applyPeriod('2026-05-01', '2026-05-31')
    await resolveAnalytics(retry, 12)

    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
    expect(mockApi.get).toHaveBeenLastCalledWith('/analytics/dashboard/', {
      params: { date_from: '2026-05-01', date_to: '2026-05-31' },
    })
  })

  it('keeps the current effect result under Strict Mode', async () => {
    const cleanedUp = deferredAnalytics()
    const current = deferredAnalytics()
    queueAnalytics(cleanedUp, current)
    render(<StrictMode><BackofficePage /></StrictMode>)

    await resolveAnalytics(current, 12)
    await resolveAnalytics(cleanedUp, 42)

    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
  })

  it('accepts the running period while the date inputs are edited', async () => {
    const initial = deferredAnalytics()
    queueAnalytics(initial)
    render(<BackofficePage />)

    fireEvent.change(screen.getByTestId('date-from'), { target: { value: '2026-05-01' } })
    await resolveAnalytics(initial, 12)

    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
  })

  it('uses invocation order when the same period is applied twice', async () => {
    const initial = deferredAnalytics()
    const older = deferredAnalytics()
    const latest = deferredAnalytics()
    queueAnalytics(initial, older, latest)
    render(<BackofficePage />)
    await resolveAnalytics(initial, 9)
    applyPeriod()
    applyPeriod()

    await resolveAnalytics(latest, 12)
    await resolveAnalytics(older, 42)

    expect(screen.getByText('12 pedidos · $123.000 en abonos confirmados')).toBeVisible()
  })

  it('exports CSV using the dates the staff selected', async () => {
    const csvBlob = new Blob(['order_id\nMIM-001'], { type: 'text/csv' })
    const exportAnchor = { href: '', download: '', click: jest.fn() }
    mockApi.get
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: csvBlob })
    const user = userEvent.setup()
    render(<BackofficePage />)
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2))

    await user.clear(screen.getByTestId('date-from'))
    await user.type(screen.getByTestId('date-from'), '2026-04-01')
    await user.clear(screen.getByTestId('date-to'))
    await user.type(screen.getByTestId('date-to'), '2026-04-30')
    jest.spyOn(document, 'createElement').mockReturnValueOnce(exportAnchor as unknown as HTMLElement)
    await user.click(screen.getByRole('button', { name: '↓ CSV' }))

    // Fails if export uses stale dates or leaves the completed page action unavailable.
    await waitFor(() => expect(mockApi.get).toHaveBeenLastCalledWith(
      '/analytics/export/orders/?date_from=2026-04-01&date_to=2026-04-30',
      { responseType: 'blob' },
    ))
    expect(exportAnchor.download).toBe('pedidos-2026-04-01.csv')
    expect(exportAnchor.click).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '↓ CSV' })).toBeEnabled()
  })
})
