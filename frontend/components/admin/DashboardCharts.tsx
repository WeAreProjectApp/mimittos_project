'use client'

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

import type { DashboardData } from '@/lib/services/analyticsAdminService'

const COLORS = ['#D4848A', '#1B2A4A', '#E8A87C', '#2E7D32', '#1976D2', '#9C27B0']

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }

export default function DashboardCharts({ data }: { data: DashboardData }) {
  const deviceData = [
    { name: 'Móvil', value: data.device_types?.mobile ?? 0 },
    { name: 'Desktop', value: data.device_types?.desktop ?? 0 },
    { name: 'Tablet', value: data.device_types?.tablet ?? 0 },
  ]

  const newVsReturning = [
    { name: 'Nuevos', value: data.new_vs_returning?.new ?? 0 },
    { name: 'Recurrentes', value: data.new_vs_returning?.returning ?? 0 },
  ]

  const trafficData = Object.entries(data.traffic_sources ?? {}).map(([key, val]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    visitas: val,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Tendencia de pedidos */}
      <ChartCard title="Tendencia de pedidos" description="Pedidos e ingresos diarios en el período seleccionado">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.daily_orders ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,42,74,.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value, name) => name === 'Ingresos ($)' ? fmt(Number(value)) : value} />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="orders" stroke="#D4848A" strokeWidth={2} name="Pedidos" dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#1B2A4A" strokeWidth={2} name="Ingresos ($)" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Row: Nuevos vs recurrentes + Dispositivos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Nuevos vs recurrentes" description="Fidelización de clientes en el período">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={newVsReturning} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => `${name ?? ''} ${(((percent as number) ?? 0) * 100).toFixed(0)}%`}>
                {newVsReturning.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Dispositivos" description="Cómo acceden los visitantes">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={deviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => `${name ?? ''} ${(((percent as number) ?? 0) * 100).toFixed(0)}%`}>
                {deviceData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: Peluches más vendidos + Fuentes de tráfico */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Peluches más vendidos" description="Unidades vendidas en el período">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={(data.top_peluches ?? []).slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,42,74,.06)" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="title" width={150} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total_sold" name="Vendidos" fill="#D4848A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fuentes de tráfico" description="De dónde llegan los visitantes">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trafficData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,42,74,.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="visitas" name="Visitas" fill="#1B2A4A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

    </div>
  )
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '20px 22px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--gray-warm)' }}>{description}</div>
      </div>
      {children}
    </div>
  )
}
