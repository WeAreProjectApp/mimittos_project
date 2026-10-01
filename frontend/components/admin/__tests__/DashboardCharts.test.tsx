import { describe, expect, it } from '@jest/globals'
import { render, screen } from '@testing-library/react'

import DashboardCharts from '../DashboardCharts'

jest.mock('recharts', () => ({
  LineChart: ({ data, children }: { data: unknown; children?: React.ReactNode }) => (
    <><output data-testid="daily-series">{JSON.stringify(data)}</output>{children}</>
  ),
  BarChart: ({ data }: { data: Array<{ title?: string }> }) => (
    <output data-testid={data[0]?.title ? 'peluch-series' : 'traffic-series'}>{JSON.stringify(data)}</output>
  ),
  PieChart: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Pie: ({ data }: { data: Array<{ name: string }> }) => (
    <output data-testid={data[0]?.name === 'Nuevos' ? 'returning-series' : 'device-series'}>{JSON.stringify(data)}</output>
  ),
  Tooltip: ({ formatter }: { formatter?: (value: number, name: string) => string | number }) => (
    formatter ? <output data-testid="revenue-formatter">{formatter(12500, 'Ingresos ($)')}</output> : null
  ),
  Line: () => null,
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

const data = {
  daily_orders: [{ date: '2026-04-01', orders: 2, revenue: 12500 }],
  top_peluches: Array.from({ length: 9 }, (_, index) => ({ title: `Peluch ${index + 1}`, total_sold: index + 1, slug: `peluch-${index + 1}` })),
  new_vs_returning: { new: 3, returning: 1 },
  device_types: { mobile: 5, desktop: 2, tablet: 1 },
  traffic_sources: { instagram: 7 },
  confirmed_revenue: 12500,
  total_orders: 2,
  orders_by_status: {},
}
const firstEightPeluches = [
  { title: 'Peluch 1', total_sold: 1, slug: 'peluch-1' },
  { title: 'Peluch 2', total_sold: 2, slug: 'peluch-2' },
  { title: 'Peluch 3', total_sold: 3, slug: 'peluch-3' },
  { title: 'Peluch 4', total_sold: 4, slug: 'peluch-4' },
  { title: 'Peluch 5', total_sold: 5, slug: 'peluch-5' },
  { title: 'Peluch 6', total_sold: 6, slug: 'peluch-6' },
  { title: 'Peluch 7', total_sold: 7, slug: 'peluch-7' },
  { title: 'Peluch 8', total_sold: 8, slug: 'peluch-8' },
]

describe('DashboardCharts', () => {
  it('passes the complete daily series to the chart', () => {
    render(<DashboardCharts data={data} />)

    // Fails if extracting the chart changes the daily analytics series.
    expect(JSON.parse(screen.getByTestId('daily-series').textContent ?? '[]')).toEqual([{ date: '2026-04-01', orders: 2, revenue: 12500 }])
  })

  it('formats revenue as Colombian currency', () => {
    render(<DashboardCharts data={data} />)

    // Fails if extracting the chart changes the revenue formatter.
    expect(screen.getByTestId('revenue-formatter')).toHaveTextContent('$12.500')
  })

  it('passes named returning-customer segments to the chart', () => {
    render(<DashboardCharts data={data} />)

    // Fails if the extraction drops the returning-customer segment values.
    expect(JSON.parse(screen.getByTestId('returning-series').textContent ?? '[]')).toEqual([{ name: 'Nuevos', value: 3 }, { name: 'Recurrentes', value: 1 }])
  })

  it('passes named device segments to the chart', () => {
    render(<DashboardCharts data={data} />)

    // Fails if the extraction drops the device segment values.
    expect(JSON.parse(screen.getByTestId('device-series').textContent ?? '[]')).toEqual([{ name: 'Móvil', value: 5 }, { name: 'Desktop', value: 2 }, { name: 'Tablet', value: 1 }])
  })

  it('limits the product series to eight entries', () => {
    render(<DashboardCharts data={data} />)

    // Fails if the extracted chunk removes the product cap.
    expect(JSON.parse(screen.getByTestId('peluch-series').textContent ?? '[]')).toEqual(firstEightPeluches)
  })

  it('labels traffic sources with title case', () => {
    render(<DashboardCharts data={data} />)

    // Fails if the extracted chunk changes traffic source labels.
    expect(JSON.parse(screen.getByTestId('traffic-series').textContent ?? '[]')).toEqual([{ name: 'Instagram', visitas: 7 }])
  })
})
