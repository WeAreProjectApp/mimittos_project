import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
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
