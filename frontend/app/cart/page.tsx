'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useMemo } from 'react'

import {
  calcDeposit, calcFullPaymentDiscount, calcShipping, describeCartPersonalization, lineTotal, useCartStore,
} from '@/lib/stores/cartStore'

export default function CartPage() {
  const items = useCartStore((s) => s.items)
  const removeFromCart = useCartStore((s) => s.removeFromCart)
  const updateQuantity = useCartStore((s) => s.updateQuantity)

  const subtotal = useMemo(() => items.reduce((acc, item) => acc + lineTotal(item), 0), [items])
  const deposit = useMemo(() => calcDeposit(items), [items])
  const shipping = useMemo(() => calcShipping(items), [items])
  const fullDiscount = useMemo(() => calcFullPaymentDiscount(items), [items])
  const balanceAtDelivery = subtotal - deposit + shipping
  const fullPaymentNow = Math.max(subtotal - fullDiscount, 0) + shipping
  const grandTotal = subtotal + shipping
  const allFreeShipping = items.length > 0 && items.every((i) => i.free_shipping)

  function fmt(n: number | undefined | null) { return '$' + (n ?? 0).toLocaleString('es-CO') }

  return (
    <main>
      {/* Breadcrumb */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10 py-5 flex items-center gap-2" style={{ maxWidth: 1360, fontSize: 13, color: 'var(--gray-warm)' }}>
        <Link href="/" style={{ color: 'var(--gray-warm)' }}>Inicio</Link>
        <span style={{ opacity: .5 }}>/</span>
        <b style={{ color: 'var(--navy)', fontWeight: 700 }}>Carrito de compra</b>
      </div>

      {/* Page title */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10 pt-2 pb-8" style={{ maxWidth: 1360 }}>
        <div style={eyebrowStyle}>Tu carrito</div>
        <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 'clamp(26px, 6vw, 46px)', color: 'var(--navy)', letterSpacing: '-.02em', lineHeight: 1.1 }}>
          Ya casi los tienes en tus brazos 🧸
        </h1>
        <p style={{ color: 'var(--gray-warm)', fontSize: 16, marginTop: 10, maxWidth: 600, lineHeight: 1.55 }}>
          Revisa los peluches que están esperándote. Puedes ajustar cantidades o eliminar ítems antes de pasar al pago.
        </p>
      </div>

      {/* Steps */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10" style={{ maxWidth: 1360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30, flexWrap: 'wrap' }}>
          {['Carrito', 'Datos y envío', 'Pago Wompi', 'Confirmación'].map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: i === 0 ? 'var(--coral)' : '#fff', color: i === 0 ? '#fff' : 'var(--gray-warm)', border: i === 0 ? 'none' : '1.5px solid rgba(27,42,74,.1)', display: 'grid', placeItems: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <span className="hidden sm:inline" style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--navy)' : 'var(--gray-warm)' }}>{s}</span>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 1.5, background: 'rgba(27,42,74,.08)', minWidth: 12, maxWidth: 60 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10 pb-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-start" style={{ maxWidth: 1360 }}>
        {/* Cart list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 48 }}>🧸</div>
              <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--navy)', margin: '14px 0 10px' }}>Tu carrito está vacío</h3>
              <p style={{ color: 'var(--gray-warm)', fontSize: 14, marginBottom: 20 }}>Descubre nuestros peluches y empieza a crear recuerdos</p>
              <Link href="/catalog" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderRadius: 999, fontWeight: 600, fontSize: 15, background: 'var(--coral)', color: '#fff', boxShadow: '0 8px 22px rgba(212,132,138,.35)' }}>
                Ver catálogo
              </Link>
            </div>
          ) : (
            items.map((item) => {
              const cover = item.gallery_urls?.[0]
              const itemTotal = lineTotal(item)
              const itemKey = `${item.peluch_id}-${item.size_id}-${item.color_id}`
              return (
                <div key={item.cart_line_id} role="group" aria-label={`${item.title} ${describeCartPersonalization(item).join(' · ')}`} data-testid={`cart-item-${itemKey}`} className="grid grid-cols-[90px_1fr] sm:grid-cols-[120px_1fr_auto] gap-4 sm:gap-5" style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
                  <div className="w-[90px] h-[90px] sm:w-[120px] sm:h-[120px]" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', background: item.color_hex || 'var(--pink-melo)', position: 'relative' }}>
                    {cover && <Image src={cover} alt={item.title} fill style={{ objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 'clamp(16px, 4vw, 20px)', color: 'var(--navy)', marginBottom: 6 }}>{item.title}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      <span style={{ background: 'var(--pink-melo)', color: 'var(--terracotta)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>
                        {item.size_label}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--cream-peach)', color: 'var(--navy)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color_hex, display: 'inline-block', border: '1px solid rgba(0,0,0,.1)' }} />
                        {item.color_name}
                      </span>
                      {item.has_huella && <span style={{ background: '#FFF0E8', color: '#B8696F', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>🐾 Huella</span>}
                      {item.has_corazon && <span style={{ background: '#FFF0E8', color: '#B8696F', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>💖 Corazón</span>}
                      {item.has_audio && <span style={{ background: '#FFF0E8', color: '#B8696F', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>🔊 Audio</span>}
                    </div>
                    {describeCartPersonalization(item).map((description) => <p key={description} style={{ fontSize: 12, color: 'var(--navy)', overflowWrap: 'anywhere' }}>{description}</p>)}
                    <div style={{ fontSize: 12, color: 'var(--gray-warm)' }}>
                      Precio base: {fmt(item.unit_price)} {item.personalization_cost > 0 && `+ ${fmt(item.personalization_cost)} personalización`}
                    </div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10 }}>
                      <button onClick={() => removeFromCart(item.cart_line_id)} style={{ color: '#c23b3b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-between gap-3 sm:gap-4">
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--cream-warm)', border: '1.5px solid rgba(27,42,74,.08)', borderRadius: 12, padding: 4 }}>
                      <button onClick={() => updateQuantity(item.cart_line_id, Math.max(1, item.quantity - 1))} style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--navy)', fontSize: 16, fontWeight: 700, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>−</button>
                      <span style={{ width: 34, textAlign: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.cart_line_id, item.quantity + 1)} style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--navy)', fontSize: 16, fontWeight: 700, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>+</button>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: 'var(--gray-warm)' }}>{fmt(item.unit_price + item.personalization_cost)} c/u</div>
                      <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--terracotta)' }}>{fmt(itemTotal)}</div>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {items.length > 0 && (
            <Link href="/catalog" style={{ background: 'linear-gradient(135deg,var(--cream-peach),var(--pink-melo))', borderRadius: 'var(--radius-lg)', padding: 22, display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginBottom: 2 }}>¿Sigues buscando?</strong>
                <span style={{ fontSize: 13, color: 'var(--gray-warm)' }}>Descubre más peluches que podrían hacerte sonreír</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 999, fontWeight: 600, fontSize: 14, background: 'var(--coral)', color: '#fff' }}>
                Seguir explorando
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </div>
            </Link>
          )}
        </div>

        {/* Summary */}
        {items.length > 0 && (
          <aside style={{ position: 'sticky', top: 110, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--navy)', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Resumen del pedido
              <span style={{ fontSize: 13, color: 'var(--gray-warm)', fontWeight: 500 }}>{items.reduce((a, i) => a + i.quantity, 0)} peluches</span>
            </h3>

            <div style={sumRowStyle}><span>Subtotal productos</span><b style={{ color: 'var(--navy)' }}>{fmt(subtotal)}</b></div>
            <div style={sumRowStyle}>
              <span>Envío</span>
              <b style={{ color: shipping === 0 ? '#4CAF50' : 'var(--navy)' }}>
                {shipping === 0 ? (allFreeShipping ? 'Gratis' : 'Sin costo') : fmt(shipping)}
              </b>
            </div>
            <div style={{ height: 1, background: 'rgba(212,132,138,.2)', margin: '12px 0' }} />
            <div style={{ ...sumRowStyle, paddingTop: 16 }}>
              <span style={{ fontSize: 15, color: 'var(--navy)', fontWeight: 700 }}>Total del pedido</span>
              <b style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 24, color: 'var(--terracotta)' }}>{fmt(grandTotal)}</b>
            </div>

            <div style={{ background: 'var(--cream-peach)', borderRadius: 'var(--radius-md)', padding: 18, margin: '18px 0' }}>
              <h4 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>Opciones de pago</h4>

              {/* Option A — deposit */}
              <div style={{ marginBottom: 14 }}>
                <div style={sumRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--navy)', fontWeight: 600, fontSize: 13 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 11 }}>A</span>
                    Pagar anticipo <span style={{ fontSize: 11, color: 'var(--gray-warm)', fontWeight: 500 }}>— hoy</span>
                  </div>
                  <b style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--terracotta)' }}>{fmt(deposit)}</b>
                </div>
                <div style={sumRowStyle}>
                  <span style={{ fontSize: 12, paddingLeft: 30 }}>Saldo + envío al recibir</span>
                  <b style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--gray-warm)' }}>{fmt(balanceAtDelivery)}</b>
                </div>
              </div>

              {/* Option B — full payment */}
              {fullDiscount > 0 ? (
                <div style={{ paddingTop: 12, borderTop: '1px dashed rgba(27,42,74,.12)' }}>
                  <div style={sumRowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--navy)', fontWeight: 600, fontSize: 13 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#4CAF50', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 11 }}>B</span>
                      Pagar todo de una <span style={{ fontSize: 11, color: '#4CAF50', fontWeight: 600 }}>— ahorra {fmt(fullDiscount)}</span>
                    </div>
                    <b style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, color: '#4CAF50' }}>{fmt(fullPaymentNow)}</b>
                  </div>
                  <div style={sumRowStyle}>
                    <span style={{ fontSize: 12, paddingLeft: 30 }}>Saldo al recibir</span>
                    <b style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--gray-warm)' }}>$0</b>
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--gray-warm)', fontStyle: 'italic' }}>
                Eliges qué opción usar al confirmar el pago en el checkout.
              </div>
            </div>

            <Link href="/checkout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--coral)', color: '#fff', width: '100%', padding: 16, borderRadius: 14, fontWeight: 700, fontSize: 16, fontFamily: "'Quicksand', sans-serif", boxShadow: '0 10px 26px rgba(212,132,138,.4)', textDecoration: 'none' }}>
              Continuar al checkout
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
            <Link href="/catalog" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, padding: 14, borderRadius: 14, color: 'var(--navy)', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              Seguir comprando
            </Link>
          </aside>
        )}
      </div>
    </main>
  )
}

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--coral)', fontFamily: "'Quicksand', sans-serif",
  fontWeight: 600, fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8,
}

const sumRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  padding: '10px 0', fontSize: 14, color: 'var(--gray-warm)',
}
