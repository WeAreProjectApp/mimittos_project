'use client'

import { useEffect, useRef, useState } from 'react'

import { orderService } from '@/lib/services/orderService'
import { itemSizeLabel, itemSizeCm, itemColorName, itemColorHex } from '@/lib/utils/orderItemDisplay'
import type { OrderDetail, OrderItemRead, OrderListItem, OrderStatus, PaginatedResponse } from '@/lib/types'

const ORDERS_PAGE_SIZE = 100

interface OrdersQuery {
  status: OrderStatus | ''
  page: number
}

const STATUS_OPTIONS: OrderStatus[] = [
  'pending_payment', 'payment_confirmed', 'in_production', 'shipped', 'delivered', 'cancelled',
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pendiente pago',
  payment_confirmed: 'Pago confirmado',
  in_production: 'En producción',
  shipped: 'Despachado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<OrderStatus, { bg: string; color: string }> = {
  pending_payment: { bg: '#FFF3E0', color: '#E65100' },
  payment_confirmed: { bg: '#E3F2FD', color: '#1565C0' },
  in_production: { bg: '#FFF0E8', color: '#B8696F' },
  shipped: { bg: '#E3F2FD', color: '#1976D2' },
  delivered: { bg: '#E8F5E9', color: '#2E7D32' },
  cancelled: { bg: '#FFEBEE', color: '#C62828' },
}

const HUELLA_TYPE_LABELS: Record<string, string> = {
  name: 'Nombre',
  date: 'Fecha',
  letter: 'Inicial',
  image: 'Imagen',
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  deposit: 'Anticipo (contraentrega)',
  full: 'Pago completo',
}

function fmt(n: number) { return '$' + n.toLocaleString('es-CO') }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) }
function fmtDateTime(s: string) { return new Date(s).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

export default function PedidosAdminPage() {
  const [query, setQuery] = useState<OrdersQuery>({ status: '', page: 1 })
  const [listResponse, setListResponse] = useState<PaginatedResponse<OrderListItem> | null>(null)
  const [resolvedQuery, setResolvedQuery] = useState<OrdersQuery | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const [detailOrderNumber, setDetailOrderNumber] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const detailGeneration = useRef(0)

  const { status: filter, page } = query
  const response = resolvedQuery === query ? listResponse : null
  const orders = response?.results ?? []
  const isLoading = loading || resolvedQuery !== query
  const listError = resolvedQuery === query ? error : ''
  const totalPages = Math.max(1, Math.ceil((response?.count ?? 0) / ORDERS_PAGE_SIZE))
  const previousDisabled = isLoading || !!listError || !response?.previous
  const nextDisabled = isLoading || !!listError || !response?.next

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadOrders() {
      setLoading(true)
      setListResponse(null)
      setError('')
      try {
        const data = await orderService.listOrders(
          { page: query.page, page_size: ORDERS_PAGE_SIZE, ...(query.status ? { status: query.status } : {}) },
          { signal: controller.signal },
        )
        if (active) {
          setListResponse(data)
          setResolvedQuery(query)
        }
      } catch {
        if (active) {
          setError('No se pudieron cargar los pedidos.')
          setResolvedQuery(query)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadOrders()
    return () => {
      active = false
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    if (!detailOrderNumber) return
    const generation = ++detailGeneration.current
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    orderService.getOrderDetail(detailOrderNumber)
      .then((data) => { if (detailGeneration.current === generation) setDetail(data) })
      .catch(() => {
        if (detailGeneration.current === generation) setDetailError('No se pudo cargar el detalle del pedido.')
      })
      .finally(() => { if (detailGeneration.current === generation) setDetailLoading(false) })
    return () => {
      if (detailGeneration.current === generation) detailGeneration.current++
    }
  }, [detailOrderNumber])

  function handleFilterChange(status: OrderStatus | '') {
    setQuery((current) => current.status === status && current.page === 1
      ? current
      : { status, page: 1 })
  }

  async function handleStatusChange(orderNumber: string, newStatus: string) {
    setStatusUpdating(orderNumber)
    try {
      await orderService.updateStatus(orderNumber, newStatus)
      setListResponse((prev) => prev ? {
        ...prev,
        results: prev.results.map((o) => o.order_number === orderNumber ? { ...o, status: newStatus as OrderStatus } : o),
      } : prev)
    } catch {
      alert('No se pudo actualizar el estado.')
    } finally {
      setStatusUpdating(null)
    }
  }

  async function handleTrackingUpdate(orderNumber: string) {
    const trackingNum = trackingInputs[orderNumber]?.trim()
    if (!trackingNum) return
    try {
      await orderService.updateTracking(orderNumber, trackingNum)
      setTrackingInputs((prev) => ({ ...prev, [orderNumber]: '' }))
    } catch {
      alert('No se pudo actualizar la guía.')
    }
  }

  function openDetail(orderNumber: string) {
    detailGeneration.current++
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    setDetailOrderNumber(orderNumber)
  }

  function closeDetail() {
    detailGeneration.current++
    setDetailOrderNumber(null)
    setDetail(null)
    setDetailError('')
  }

  return (
    <div style={{ padding: '30px 40px 60px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--navy)', marginBottom: 4 }}>Pedidos</h1>
        <p style={{ color: 'var(--gray-warm)', fontSize: 14 }}>Gestión de producción y envíos{response ? ` — ${response.count} pedido(s)` : ''} · clic en una fila para ver el detalle</p>
      </div>

      {/* Filtro por estado */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => handleFilterChange('')} style={filterBtn(!filter)}>Todos</button>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} type="button" onClick={() => handleFilterChange(s)} style={filterBtn(filter === s)}>{STATUS_LABELS[s]}</button>
        ))}
      </div>

      {listError && <p role="alert" style={{ color: '#c23b3b', marginBottom: 16 }}>{listError}</p>}
      {isLoading && <p role="status" style={{ color: 'var(--gray-warm)', marginBottom: 16 }}>Cargando...</p>}

      <nav aria-label="Paginación de pedidos" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <p aria-live="polite" style={{ color: 'var(--gray-warm)', fontSize: 14 }}>
          Página {page}{response ? ` de ${totalPages}` : ''}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            aria-label="Página anterior"
            aria-controls="orders-table"
            disabled={previousDisabled}
            onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
            style={paginationBtn(previousDisabled)}
          >Anterior</button>
          <button
            type="button"
            aria-label="Página siguiente"
            aria-controls="orders-table"
            disabled={nextDisabled}
            onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
            style={paginationBtn(nextDisabled)}
          >Siguiente</button>
        </div>
      </nav>

      <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'auto' }}>
        <table id="orders-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--cream-warm)', borderBottom: '1px dashed rgba(212,132,138,.2)' }}>
              {['Pedido', 'Cliente', 'Ciudad', 'Estado', 'Total', 'Abono', 'Fecha', 'Actualizar estado', 'Guía'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const sc = STATUS_COLORS[o.status]
              return (
                <tr
                  key={o.order_number}
                  data-testid={`order-row-${o.order_number}`}
                  onClick={() => openDetail(o.order_number)}
                  style={{ borderBottom: '1px dashed rgba(212,132,138,.12)', cursor: 'pointer' }}
                >
                  <td style={tdStyle}><span style={{ fontWeight: 700, color: 'var(--navy)', textDecoration: 'underline', textDecorationColor: 'rgba(212,132,138,.4)' }}>{o.order_number}</span></td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--navy)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-warm)' }}>{o.customer_email}</div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--gray-warm)' }}>{o.city}</td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--terracotta)', whiteSpace: 'nowrap' }}>{fmt(o.total_amount)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmt(o.deposit_amount)}</td>
                  <td style={{ ...tdStyle, color: 'var(--gray-warm)', whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={o.status}
                      disabled={statusUpdating === o.order_number}
                      onChange={(e) => handleStatusChange(o.order_number, e.target.value)}
                      style={{ background: '#fff', border: '1px solid rgba(27,42,74,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--navy)', fontFamily: 'inherit', cursor: 'pointer' }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={trackingInputs[o.order_number] ?? ''}
                        onChange={(e) => setTrackingInputs((prev) => ({ ...prev, [o.order_number]: e.target.value }))}
                        placeholder="Guía..."
                        style={{ width: 90, background: 'var(--cream-warm)', border: '1px solid rgba(27,42,74,.08)', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit' }}
                      />
                      <button onClick={() => handleTrackingUpdate(o.order_number)} style={{ padding: '6px 10px', background: 'var(--coral)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>✓</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!orders.length && !isLoading && !listError && (
              <tr><td colSpan={9} style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--gray-warm)' }}>Sin pedidos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailOrderNumber && (
        <OrderDetailModal
          orderNumber={detailOrderNumber}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}

function OrderDetailModal({
  orderNumber, detail, loading, error, onClose,
}: {
  orderNumber: string
  detail: OrderDetail | null
  loading: boolean
  error: string
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del pedido ${orderNumber}`}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(27,42,74,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 200, overflowY: 'auto' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 760, padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--navy)' }}>Pedido {orderNumber}</h2>
            {detail && <span style={{ fontSize: 13, color: 'var(--gray-warm)' }}>{fmtDateTime(detail.created_at)} · {STATUS_LABELS[detail.status]}</span>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--gray-warm)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {loading && <p style={{ color: 'var(--gray-warm)' }}>Cargando detalle…</p>}
        {error && <p style={{ color: '#c23b3b' }}>{error}</p>}

        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Cliente */}
            <section>
              <h3 style={sectionTitle}>Cliente</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6, fontSize: 13 }}>
                <Field label="Nombre" value={detail.customer_name} />
                <Field label="Email" value={detail.customer_email} />
                <Field label="Teléfono" value={detail.customer_phone || '—'} />
                <Field label="Dirección" value={detail.address} />
                <Field label="Ciudad" value={`${detail.city}, ${detail.department}`} />
                <Field label="Código postal" value={detail.postal_code || '—'} />
              </div>
            </section>

            {/* Totales */}
            <section>
              <h3 style={sectionTitle}>Totales</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6, fontSize: 13 }}>
                <Field label="Subtotal productos" value={fmt(detail.total_amount)} />
                <Field label="Envío" value={fmt(detail.shipping_amount)} />
                <Field label="Descuento (pago completo)" value={detail.discount_amount > 0 ? `- ${fmt(detail.discount_amount)}` : '—'} />
                <Field label="Modo de pago" value={PAYMENT_MODE_LABELS[detail.payment_mode] ?? detail.payment_mode} />
                <Field label="Pagado ahora (Wompi)" value={fmt(detail.amount_paid_now)} />
                <Field label="Saldo pendiente" value={fmt(detail.balance_amount)} />
                <Field label="Estado de pago" value={detail.payment?.status ?? '—'} />
                <Field label="Guía / transportadora" value={detail.tracking_number ? `${detail.tracking_number}${detail.shipping_carrier ? ` (${detail.shipping_carrier})` : ''}` : '—'} />
              </div>
            </section>

            {/* Ítems */}
            <section>
              <h3 style={sectionTitle}>Productos ({detail.items.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {detail.items.map((item) => <OrderItemCard key={item.id} item={item} />)}
              </div>
            </section>

            {/* Historial */}
            {detail.status_history.length > 0 && (
              <section>
                <h3 style={sectionTitle}>Historial de estados</h3>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--gray-warm)' }}>
                  {detail.status_history.map((h) => (
                    <li key={h.id}>
                      <span style={{ color: 'var(--navy)', fontWeight: 600 }}>
                        {STATUS_LABELS[h.previous_status as OrderStatus] ?? h.previous_status} → {STATUS_LABELS[h.new_status as OrderStatus] ?? h.new_status}
                      </span>
                      {' · '}{fmtDateTime(h.changed_at)}
                      {h.changed_by_email ? ` · ${h.changed_by_email}` : ''}
                      {h.notes ? ` — ${h.notes}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OrderItemCard({ item }: { item: OrderItemRead }) {
  const hasPersonalization = item.has_huella || item.has_corazon || item.has_audio
  return (
    <div style={{ border: '1px solid rgba(212,132,138,.2)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{item.peluch_title}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-warm)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span>Talla: {itemSizeLabel(item)} · {itemSizeCm(item)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Color: <span style={{ width: 12, height: 12, borderRadius: '50%', background: itemColorHex(item), border: '1px solid rgba(27,42,74,.15)', display: 'inline-block' }} /> {itemColorName(item)}
            </span>
            <span>Cantidad: {item.quantity}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--gray-warm)' }}>
          <div>Unitario: {fmt(item.unit_price)}</div>
          {item.personalization_cost > 0 && <div>Personalización: +{fmt(item.personalization_cost)}</div>}
          <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 14, marginTop: 2 }}>{fmt(item.line_total)}</div>
        </div>
      </div>

      {hasPersonalization && (
        <div data-testid="item-personalization" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(212,132,138,.25)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Personalización</div>

          {item.has_huella && (
            <div>
              <span style={{ fontWeight: 600, color: 'var(--navy)' }}>🐾 Huella</span>
              {' — '}{HUELLA_TYPE_LABELS[item.huella_type] ?? item.huella_type}
              {item.huella_type === 'image' ? (
                item.huella_media_url ? (
                  <a href={item.huella_media_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--coral)', fontWeight: 600, marginLeft: 8 }}>Ver imagen</a>
                ) : <span style={{ color: 'var(--gray-warm)', marginLeft: 8 }}>(sin archivo)</span>
              ) : (
                item.huella_text ? <>: <b style={{ color: 'var(--navy)' }}>{item.huella_text}</b></> : null
              )}
            </div>
          )}

          {item.has_corazon && (
            <div>
              <span style={{ fontWeight: 600, color: 'var(--navy)' }}>💖 Corazón</span>
              {item.corazon_phrase ? <>: <b style={{ color: 'var(--navy)' }}>“{item.corazon_phrase}”</b></> : <span style={{ color: 'var(--gray-warm)' }}> (sin frase)</span>}
            </div>
          )}

          {item.has_audio && (
            <div data-testid="item-audio">
              <span style={{ fontWeight: 600, color: 'var(--navy)' }}>🔊 Audio personalizado</span>
              {item.audio_duration_sec != null && <span style={{ color: 'var(--gray-warm)' }}> · {item.audio_duration_sec.toFixed(1)}s</span>}
              {item.audio_size_kb != null && <span style={{ color: 'var(--gray-warm)' }}> · {item.audio_size_kb} KB</span>}
              {item.audio_media_url ? (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <audio data-testid="audio-player" controls src={item.audio_media_url} style={{ height: 34 }}>Tu navegador no soporta audio.</audio>
                  <a href={item.audio_media_url} target="_blank" rel="noopener noreferrer" download style={{ color: 'var(--coral)', fontWeight: 600, fontSize: 12 }}>Descargar</a>
                </div>
              ) : <span style={{ color: 'var(--gray-warm)', marginLeft: 8 }}>(archivo no disponible)</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: 'var(--gray-warm)', fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const sectionTitle: React.CSSProperties = { fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }
const thStyle: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '10px 14px' }
function filterBtn(active: boolean): React.CSSProperties {
  return { minHeight: 44, padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1.5px solid ${active ? 'var(--coral)' : 'rgba(27,42,74,.08)'}`, background: active ? 'var(--coral)' : '#fff', color: active ? '#fff' : 'var(--navy)', cursor: 'pointer', fontFamily: 'inherit' }
}

function paginationBtn(disabled: boolean): React.CSSProperties {
  return { minHeight: 44, minWidth: 44, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid rgba(27,42,74,.1)', background: '#fff', color: 'var(--navy)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit' }
}
