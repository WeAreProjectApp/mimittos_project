'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

import { api } from '@/lib/services/http'
import { analyticsAdminService } from '@/lib/services/analyticsAdminService'
import type { DashboardData } from '@/lib/services/analyticsAdminService'

type KPIs = {
  new_orders: number
  in_production: number
  pending_dispatch: number
  confirmed_deposits: number
}

const DashboardCharts = dynamic(() => import('@/components/admin/DashboardCharts'), {
  ssr: false,
  loading: () => <p style={{ color: 'var(--gray-warm)' }}>Cargando analytics...</p>,
})

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }
function today() { return new Date().toISOString().slice(0, 10) }
function monthAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10)
}

const QUICK_LINKS = [
  { href: '/backoffice/pedidos', label: 'Pedidos', icon: '📦', desc: 'Gestionar producción y envíos' },
  { href: '/backoffice/peluches', label: 'Catálogo', icon: '🧸', desc: 'Crear y editar modelos' },
  { href: '/backoffice/categorias', label: 'Categorías', icon: '🏷️', desc: 'Organizar el catálogo' },
  { href: '/backoffice/usuarios', label: 'Usuarios', icon: '👤', desc: 'Ver clientes y roles' },
]

const dateInput: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1.5px solid rgba(27,42,74,.12)',
  fontSize: 13, fontFamily: 'inherit', background: 'var(--cream-warm)',
}

export default function BackofficeDashboard() {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [kpisLoading, setKpisLoading] = useState(true)

  const [data, setData] = useState<DashboardData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [dateFrom, setDateFrom] = useState(monthAgo())
  const [dateTo, setDateTo] = useState(today())

  useEffect(() => {
    api.get('/analytics/kpis/')
      .then((r) => setKpis(r.data as KPIs))
      .catch(() => null)
      .finally(() => setKpisLoading(false))
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    setAnalyticsLoading(true)
    try {
      const result = await analyticsAdminService.getDashboard(dateFrom, dateTo)
      setData(result)
    } catch { /* silently fail */ }
    finally { setAnalyticsLoading(false) }
  }

  async function handleExport() {
    setExporting(true)
    try { await analyticsAdminService.exportOrdersCSV(dateFrom, dateTo) }
    catch { alert('No se pudo exportar el reporte.') }
    finally { setExporting(false) }
  }


  return (
    <div className="px-4 sm:px-8 py-8">

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--navy)', marginBottom: 4 }}>Dashboard</h1>
          <p style={{ color: 'var(--gray-warm)', fontSize: 14 }}>
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>Período:</span>
            <input data-testid="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInput} />
            <span style={{ color: 'var(--gray-warm)', fontSize: 12 }}>→</span>
            <input data-testid="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInput} />
            <button onClick={loadAnalytics} style={{ padding: '7px 14px', background: 'var(--coral)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>Aplicar</button>
          </div>
          <button onClick={handleExport} disabled={exporting} style={{ padding: '10px 16px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
            {exporting ? 'Exportando...' : '↓ CSV'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {kpisLoading ? (
        <p style={{ color: 'var(--gray-warm)', marginBottom: 28 }}>Cargando métricas...</p>
      ) : kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Pedidos nuevos hoy', value: String(kpis.new_orders ?? 0), color: 'var(--coral)' },
            { label: 'En producción', value: String(kpis.in_production ?? 0), color: '#B8696F' },
            { label: 'Por despachar', value: String(kpis.pending_dispatch ?? 0), color: '#1976D2' },
            { label: 'Abonos confirmados hoy', value: fmt(kpis.confirmed_deposits ?? 0), color: '#2E7D32' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)', borderLeft: `4px solid ${color}` }}>
              <div style={{ fontSize: 11, color: 'var(--gray-warm)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 800, fontSize: 30, color: 'var(--navy)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-9">
        {QUICK_LINKS.map(({ href, label, icon, desc }) => (
          <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', textDecoration: 'none', border: '1.5px solid transparent' }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-warm)', marginTop: 1 }}>{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Analytics */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--navy)', marginBottom: 4 }}>Analytics del período</h2>
        {data && (
          <p style={{ fontSize: 13, color: 'var(--gray-warm)' }}>
            {data.total_orders} pedidos · {fmt(data.confirmed_revenue)} en abonos confirmados
          </p>
        )}
      </div>

      {analyticsLoading ? (
        <p style={{ color: 'var(--gray-warm)' }}>Cargando analytics...</p>
      ) : data && (
        <DashboardCharts data={data} />
      )}
    </div>
  )
}

