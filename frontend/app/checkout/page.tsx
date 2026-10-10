'use client'

import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import { orderService } from '@/lib/services/orderService'
import { storeOrderAccess } from '@/lib/utils/orderAccess'
import {
  calcAmountToPayNow, calcBalanceAtDelivery, calcDeposit, calcFullPaymentDiscount,
  calcShipping, lineTotal, useCartStore,
} from '@/lib/stores/cartStore'
import type { PaymentMode } from '@/lib/types'
import { COLOMBIA_DEPARTMENTS, COLOMBIA_LOCATIONS } from '@/lib/data/colombiaLocations'

const DEPARTMENTS = COLOMBIA_DEPARTMENTS
const DEFAULT_DEPARTMENT = 'Cundinamarca'
const DEFAULT_CITY = 'Bogotá'

export default function CheckoutPage() {
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const clearCart = useCartStore((s) => s.clearCart)

  const subtotal = useMemo(() => items.reduce((acc, item) => acc + lineTotal(item), 0), [items])
  const deposit = useMemo(() => calcDeposit(items), [items])
  const shipping = useMemo(() => calcShipping(items), [items])
  const fullDiscount = useMemo(() => calcFullPaymentDiscount(items), [items])
  const allFreeShipping = items.length > 0 && items.every((i) => i.free_shipping)

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('deposit')
  const amountPaidNow = useMemo(() => calcAmountToPayNow(items, paymentMode), [items, paymentMode])
  const balanceAtDelivery = useMemo(() => calcBalanceAtDelivery(items, paymentMode), [items, paymentMode])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT)
  const [city, setCity] = useState(DEFAULT_CITY)
  const cities = useMemo(
    () => COLOMBIA_LOCATIONS[department] ?? [],
    [department],
  )

  useEffect(() => {
    if (cities.length > 0 && !cities.includes(city)) {
      setCity(cities[0])
    }
  }, [department, cities, city])
  const [postalCode, setPostalCode] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [itemErrors, setItemErrors] = useState<Record<number, CartLineIssue>>({})

  useEffect(() => { setHydrated(true) }, [])

  function fmt(n: number | undefined | null) { return '$' + (n ?? 0).toLocaleString('es-CO') }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!terms) { setError('Debes aceptar los términos y condiciones.'); return }
    if (items.length === 0) { setError('Tu carrito está vacío.'); return }

    const validItems = items.filter(
      (item) =>
        typeof item.peluch_id === 'number' && item.peluch_id > 0 &&
        typeof item.size_id === 'number' && item.size_id > 0 &&
        typeof item.color_id === 'number' && item.color_id > 0
    )
    if (validItems.length !== items.length) {
      clearCart()
      setError('Algunos productos de tu carrito estaban desactualizados y fueron eliminados. Por favor agrégalos de nuevo.')
      return
    }

    setLoading(true)
    setError('')
    setItemErrors({})
    try {
      const result = await orderService.createOrder({
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        address,
        city,
        department,
        postal_code: postalCode,
        notes,
        items: validItems,
        payment_mode: paymentMode,
      })
      storeOrderAccess(result.order_number, result)
      const guestParam = result.is_guest ? '&guest=1' : ''
      router.push(`/payment?order=${result.order_number}&amount=${result.amount_paid_now}${guestParam}`)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: CreateOrderErrorBody } })?.response?.data
      const lineErrors: Record<number, CartLineIssue> = {}
      // Entries keep each cart-line index whether the API sends an indexed object or an array.
      Object.entries(data?.items ?? {}).forEach(([index, line]) => {
        if (!line || typeof line !== 'object') return
        const lineIndex = Number(index)
        if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= items.length) return
        const mediaMessages = ['huella_media_id', 'huella_media_token', 'audio_media_id', 'audio_media_token']
          .flatMap((field) => line[field] ?? [])
          .filter((message) => typeof message === 'string')
        const cartMessages = ['quantity', 'peluch_id', 'size_id', 'color_id']
          .flatMap((field) => line[field] ?? [])
          .filter((message) => typeof message === 'string')
        const messages = [...cartMessages, ...mediaMessages]
        if (messages.length) lineErrors[lineIndex] = {
          messages, media: mediaMessages.length > 0, cart: cartMessages.length > 0,
        }
      })
      setItemErrors(lineErrors)
      setError(Object.values(lineErrors).some((issue) => issue.cart)
        ? 'Revisa los productos indicados para continuar. Tu carrito se conserva.'
        : Object.keys(lineErrors).length
          ? 'Actualiza los archivos de los productos indicados para continuar. Tu carrito se conserva.'
          : data?.detail || data?.non_field_errors?.[0] || 'No pudimos completar el pedido. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      {/* Breadcrumb */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10 py-5" style={{ maxWidth: 1360, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-warm)' }}>
        <Link href="/" style={{ color: 'var(--gray-warm)' }}>Inicio</Link>
        <span style={{ opacity: .5 }}>/</span>
        <Link href="/cart" style={{ color: 'var(--gray-warm)' }}>Carrito</Link>
        <span style={{ opacity: .5 }}>/</span>
        <b style={{ color: 'var(--navy)', fontWeight: 700 }}>Checkout</b>
      </div>

      <div className="mx-auto px-4 sm:px-8 lg:px-10 py-5 pb-8" style={{ maxWidth: 1360 }}>
        <div style={eyebrowStyle}>Último paso</div>
        <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 'clamp(26px, 6vw, 46px)', color: 'var(--navy)', letterSpacing: '-.02em', lineHeight: 1.1 }}>
          Un abrazo de distancia ♡
        </h1>
        <p style={{ color: 'var(--gray-warm)', fontSize: 16, marginTop: 10, maxWidth: 600, lineHeight: 1.55 }}>
          Completa tus datos, elige cómo querés pagar y serás redirigido a Wompi de forma segura.
        </p>
      </div>

      {/* Steps */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10" style={{ maxWidth: 1360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30, flexWrap: 'wrap' }}>
          {[['Carrito', true, true], ['Datos y envío', true, false], ['Pago Wompi', false, false], ['Confirmación', false, false]].map(([label, done, passed], i) => (
            <React.Fragment key={String(label)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: done ? 'var(--coral)' : '#fff', color: done ? '#fff' : 'var(--gray-warm)', border: done ? 'none' : '1.5px solid rgba(27,42,74,.1)', display: 'grid', placeItems: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {passed ? '✓' : i + 1}
                </div>
                <span className="hidden sm:inline" style={{ fontSize: 14, fontWeight: done ? 700 : 500, color: done ? 'var(--navy)' : 'var(--gray-warm)' }}>{label}</span>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 1.5, background: done ? 'var(--coral)' : 'rgba(27,42,74,.08)', minWidth: 12, maxWidth: 60 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="mx-auto px-4 sm:px-8 lg:px-10 pb-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-start" style={{ maxWidth: 1360 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Contact */}
            <div style={cardStyle}>
              <h3 style={cardHeadStyle}><span style={cardNumStyle}>1</span> Contacto</h3>
              <p style={{ color: 'var(--gray-warm)', fontSize: 14, marginBottom: 20 }}>Usaremos estos datos para enviarte notificaciones sobre tu pedido</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
                <div style={fieldWrap}><label htmlFor="checkout-name" style={fieldLabel}>Nombre completo</label><input id="checkout-name" value={name} onChange={(e) => setName(e.target.value)} style={fieldInput} required /></div>
                <div style={fieldWrap}><label htmlFor="checkout-email" style={fieldLabel}>Correo electrónico</label><input type="email" id="checkout-email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldInput} required /></div>
                <div style={fieldWrap}><label htmlFor="checkout-phone" style={fieldLabel}>Celular</label><input id="checkout-phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={fieldInput} required /></div>
              </div>
            </div>

            {/* Shipping */}
            <div style={cardStyle}>
              <h3 style={cardHeadStyle}><span style={cardNumStyle}>2</span> Dirección de envío</h3>
              <p style={{ color: 'var(--gray-warm)', fontSize: 14, marginBottom: 20 }}>¿A dónde le llevamos el abrazo?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
                <div style={fieldWrap}>
                  <label htmlFor="checkout-department" style={fieldLabel}>Departamento</label>
                  <select id="checkout-department" value={department} onChange={(e) => setDepartment(e.target.value)} style={fieldInput}>
                    {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={fieldWrap}>
                  <label htmlFor="checkout-city" style={fieldLabel}>Ciudad</label>
                  <select id="checkout-city" value={city} onChange={(e) => setCity(e.target.value)} style={fieldInput} disabled={cities.length === 0}>
                    {cities.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={fieldWrap}>
                  <label htmlFor="checkout-postal-code" style={fieldLabel}>Código postal</label>
                  <input id="checkout-postal-code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="050001" style={fieldInput} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={fieldWrap}><label htmlFor="checkout-address" style={fieldLabel}>Dirección completa</label><input id="checkout-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle 50 # 40-20, Apto 301" style={fieldInput} required /></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={fieldWrap}><label htmlFor="checkout-notes" style={fieldLabel}>Notas para el pedido (opcional)</label><input id="checkout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instrucciones especiales..." style={fieldInput} /></div>
              </div>
            </div>

            {/* Payment mode selector */}
            <div style={cardStyle}>
              <h3 style={cardHeadStyle}><span style={cardNumStyle}>3</span> Modalidad de pago</h3>
              <p style={{ color: 'var(--gray-warm)', fontSize: 14, marginBottom: 18 }}>
                Elige cómo querés pagar. El cobro se hace por <strong>Wompi</strong> (tarjetas, PSE, Nequi, etc.).
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label htmlFor="pm-deposit" style={{ ...modeOptionStyle, borderColor: paymentMode === 'deposit' ? 'var(--coral)' : 'rgba(27,42,74,.1)', background: paymentMode === 'deposit' ? '#FFF6F2' : '#fff' }}>
                  <input id="pm-deposit" type="radio" name="payment_mode" value="deposit" checked={paymentMode === 'deposit'} onChange={() => setPaymentMode('deposit')} style={{ accentColor: 'var(--coral)', marginTop: 4, width: 18, height: 18 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <strong style={{ fontFamily: "'Quicksand', sans-serif", color: 'var(--navy)', fontSize: 15 }}>Pagar anticipo</strong>
                      <b style={{ fontFamily: "'Quicksand', sans-serif", color: 'var(--terracotta)', fontSize: 17 }}>{fmt(deposit)}</b>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--gray-warm)', marginTop: 4 }}>
                      Hoy pagás solo el anticipo. El saldo + envío ({fmt(subtotal - deposit + shipping)}) se cancela al recibir.
                    </div>
                  </div>
                </label>

                <label htmlFor="pm-full" style={{ ...modeOptionStyle, borderColor: paymentMode === 'full' ? '#4CAF50' : 'rgba(27,42,74,.1)', background: paymentMode === 'full' ? '#F1FAF2' : '#fff', opacity: fullDiscount > 0 ? 1 : 0.7 }}>
                  <input id="pm-full" type="radio" name="payment_mode" value="full" checked={paymentMode === 'full'} onChange={() => setPaymentMode('full')} style={{ accentColor: '#4CAF50', marginTop: 4, width: 18, height: 18 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <strong style={{ fontFamily: "'Quicksand', sans-serif", color: 'var(--navy)', fontSize: 15 }}>
                        Pagar todo de una
                        {fullDiscount > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#4CAF50', background: '#E8F5E9', padding: '2px 8px', borderRadius: 999 }}>−{fmt(fullDiscount)}</span>}
                      </strong>
                      <b style={{ fontFamily: "'Quicksand', sans-serif", color: '#4CAF50', fontSize: 17 }}>{fmt(Math.max(subtotal - fullDiscount, 0) + shipping)}</b>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--gray-warm)', marginTop: 4 }}>
                      {fullDiscount > 0
                        ? 'Aprovechás el descuento por pago anticipado. No pagás nada al recibir.'
                        : 'Pagás todo hoy. Nada al recibir. Sin descuento adicional para este carrito.'}
                    </div>
                  </div>
                </label>
              </div>

              {/* Terms */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 16, background: 'var(--cream-warm)', borderRadius: 12, marginTop: 18 }}>
                <input type="checkbox" id="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--coral)', width: 18, height: 18 }} />
                <label htmlFor="terms" style={{ fontSize: 13, color: 'var(--navy)', lineHeight: 1.5, cursor: 'pointer' }}>
                  He leído y acepto los{' '}
                  <Link href="/terms" style={{ color: 'var(--coral)', fontWeight: 700, textDecoration: 'underline' }}>Términos y Condiciones</Link>
                  {' '}de MIMITTOS, incluyendo la política de abono y contraentrega.
                </label>
              </div>
            </div>
          </div>

          {/* Summary */}
          <aside style={{ position: 'sticky', top: 110, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--navy)', marginBottom: 16 }}>Tu pedido</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, maxHeight: 260, overflowY: 'auto' }}>
              {items.map((item, idx) => {
                const cover = item.gallery_urls?.[0]
                const itemTotal = lineTotal(item)
                return (
                  <div key={`${item.peluch_id}-${item.size_id}-${item.color_id}-${idx}`} style={{ display: 'flex', gap: 12, paddingBottom: 12, borderBottom: '1px dashed rgba(212,132,138,.2)' }}>
                    <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', background: item.color_hex || 'var(--pink-melo)', flexShrink: 0, position: 'relative' }}>
                      {cover && <Image src={cover} alt={item.title} fill style={{ objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{item.title}</strong>
                      <span style={{ fontSize: 11, color: 'var(--gray-warm)', display: 'block' }}>× {item.quantity} · {item.size_label} · {item.color_name}</span>
                      <b style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: 'var(--terracotta)', fontSize: 14 }}>{fmt(itemTotal)}</b>
                      {itemErrors[idx] && (
                        <div role="alert" style={{ color: '#c23b3b', fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
                          {itemErrors[idx].messages.map((message) => <p key={message}>{message}</p>)}
                          {itemErrors[idx].cart && <Link
                            href="/cart"
                            style={{ display: 'block', color: 'var(--coral)', fontWeight: 700, textDecoration: 'underline' }}
                          >Revisar {item.title} en el carrito</Link>}
                          {itemErrors[idx].media && <Link
                            href={item.peluch_slug ? `/peluches/${encodeURIComponent(item.peluch_slug)}?cartItem=${item.peluch_id}-${item.size_id}-${item.color_id}` : '/catalog'}
                            style={{ color: 'var(--coral)', fontWeight: 700, textDecoration: 'underline' }}
                          >Volver a personalizar {item.title}</Link>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {hydrated && !items.length && <p style={{ color: 'var(--gray-warm)', fontSize: 14 }}>Tu carrito está vacío. <Link href="/catalog">Ver catálogo</Link></p>}
            </div>

            <div style={sumRow}><span>Subtotal productos</span><b style={{ color: 'var(--navy)' }}>{fmt(subtotal)}</b></div>
            <div style={sumRow}>
              <span>Envío</span>
              <b style={{ color: shipping === 0 ? '#4CAF50' : 'var(--navy)' }}>
                {shipping === 0 ? (allFreeShipping ? 'Gratis' : 'Sin costo') : fmt(shipping)}
              </b>
            </div>
            {paymentMode === 'full' && fullDiscount > 0 && (
              <div style={sumRow}>
                <span>Descuento pago completo</span>
                <b style={{ color: '#4CAF50' }}>− {fmt(fullDiscount)}</b>
              </div>
            )}
            <div style={{ height: 1, background: 'rgba(212,132,138,.2)', margin: '10px 0' }} />
            <div style={sumRow}><span style={{ color: 'var(--navy)', fontWeight: 700 }}>Total a pagar hoy</span><b style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 22, color: 'var(--terracotta)' }}>{fmt(amountPaidNow)}</b></div>
            {balanceAtDelivery > 0 && (
              <div style={{ ...sumRow, fontSize: 12, color: 'var(--gray-warm)' }}>
                <span>Pagás al recibir</span>
                <b>{fmt(balanceAtDelivery)}</b>
              </div>
            )}

            <button type="submit" disabled={loading || !hydrated || !items.length || !terms} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--coral)', color: '#fff', width: '100%', padding: 16, borderRadius: 14, fontWeight: 700, fontSize: 15, fontFamily: "'Quicksand', sans-serif", boxShadow: '0 10px 26px rgba(212,132,138,.4)', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1, transition: 'all .2s', marginTop: 14 }}>
              {loading ? 'Procesando...' : `Ir a pagar · ${fmt(amountPaidNow)}`}
              {!loading && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
            </button>

            {error && <p style={{ color: '#c23b3b', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{error}</p>}

            <p style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', color: 'var(--gray-warm)', fontSize: 12, marginTop: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><path d="M12 2 4 6v6c0 5 3.5 9.7 8 10 4.5-.3 8-5 8-10V6z" /></svg>
              Pago 100% seguro con Wompi
            </p>
          </aside>
        </div>
      </form>
    </main>
  )
}

const eyebrowStyle: React.CSSProperties = { color: 'var(--coral)', fontFamily: "'Quicksand', sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--shadow-sm)' }
const cardHeadStyle: React.CSSProperties = { fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--navy)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }
const cardNumStyle: React.CSSProperties = { width: 28, height: 28, borderRadius: '50%', background: 'var(--coral)', color: '#fff', fontSize: 13, display: 'grid', placeItems: 'center' }
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--navy)', letterSpacing: '.04em', textTransform: 'uppercase' }
// 16px keeps iOS Safari from zooming into the focused field (RESPONSIVE_STANDARDS FORM-3).
const fieldInput: React.CSSProperties = { background: 'var(--cream-warm)', border: '1.5px solid rgba(27,42,74,.08)', borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit', fontSize: 16, color: 'var(--navy)', outline: 'none', width: '100%' }
const sumRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, color: 'var(--gray-warm)' }
const modeOptionStyle: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: 16, borderRadius: 14, border: '1.5px solid', cursor: 'pointer',
  transition: 'border-color .15s, background .15s',
}

type CartLineErrors = Record<string, string | string[] | undefined>

type CartLineIssue = {
  messages: string[]
  media: boolean
  cart: boolean
}

// DRF 3.18 reports only the invalid cart lines, keyed by index ({"1": {...}});
// earlier DRF versions sent one entry per line in an array.
type CreateOrderErrorBody = {
  detail?: string
  non_field_errors?: string[]
  items?: CartLineErrors[] | Record<string, CartLineErrors>
}
