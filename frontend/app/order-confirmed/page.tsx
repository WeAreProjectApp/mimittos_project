'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { paymentService } from '@/lib/services/paymentService'
import { useCartStore } from '@/lib/stores/cartStore'
import OrderAccessRecovery from '@/components/orders/OrderAccessRecovery'
import { forgetOrderAccess, isOrderAccessRequired } from '@/lib/utils/orderAccess'

type PaymentOutcome = 'pending' | 'approved' | 'declined'

const NEQUI_TIMEOUT_SECONDS = 5 * 60

function fmtCop(cents: number) {
  if (!cents) return ''
  return '$' + Math.round(cents / 100).toLocaleString('es-CO')
}

function fmtMmSs(secs: number) {
  const m = Math.floor(Math.max(0, secs) / 60)
  const s = Math.max(0, secs) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function OrderConfirmedContent() {
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order') ?? ''
  const isGuest = searchParams.get('guest') === '1'
  const [customerEmail, setCustomerEmail] = useState('')

  const clearCart = useCartStore((s) => s.clearCart)
  const [outcome, setOutcome] = useState<PaymentOutcome>('pending')
  const [authorizedOrder, setAuthorizedOrder] = useState('')
  const [accessRequired, setAccessRequired] = useState(false)
  const [accessAttempt, setAccessAttempt] = useState(0)
  const [accessError, setAccessError] = useState('')
  const accessChecked = !!orderNumber && authorizedOrder === orderNumber
  const [declineReason, setDeclineReason] = useState('')
  const [methodType, setMethodType] = useState('')
  const [amountInCents, setAmountInCents] = useState(0)
  const [nequiSecondsLeft, setNequiSecondsLeft] = useState(NEQUI_TIMEOUT_SECONDS)
  const confirmed = outcome === 'approved'
  const declined = outcome === 'declined'
  const isNequiPending = methodType === 'NEQUI' && outcome === 'pending'

  useEffect(() => {
    if (!orderNumber) return
    let cancelled = false
    setAuthorizedOrder('')
    setAccessRequired(false)
    setAccessError('')
    setOutcome('pending')
    setMethodType('')
    setCustomerEmail('')
    paymentService.getInfo(orderNumber).then((data) => {
      if (cancelled) return
      setCustomerEmail(data.customer_email)
      setAmountInCents(data.amount_in_cents)
      if (data.status === 'approved') setOutcome('approved')
      else if (['declined', 'voided', 'error'].includes(data.status)) setOutcome('declined')
      setAuthorizedOrder(orderNumber)
    }).catch((error: unknown) => {
      if (cancelled) return
      if (isOrderAccessRequired(error)) {
        forgetOrderAccess(orderNumber)
        setAccessRequired(true)
      } else {
        setAccessError('No pudimos consultar el pedido. Intenta de nuevo más tarde.')
      }
    })
    return () => { cancelled = true }
  }, [orderNumber, accessAttempt])

  useEffect(() => {
    if (confirmed && accessChecked && !accessRequired) clearCart()
  }, [confirmed, accessChecked, accessRequired, clearCart])

  useEffect(() => {
    if (outcome !== 'pending' || !orderNumber || !accessChecked || accessRequired) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function applyData(data: Awaited<ReturnType<typeof paymentService.checkStatus>>): boolean {
      if (data.payment_method_type) setMethodType(data.payment_method_type)
      if (data.amount_in_cents) setAmountInCents(data.amount_in_cents)
      if (data.status === 'approved') { setOutcome('approved'); return true }
      if (data.status === 'declined' || data.status === 'voided' || data.status === 'error') {
        setDeclineReason(data.wompi_status_message || '')
        setOutcome('declined')
        return true
      }
      return false
    }

    async function check() {
      try {
        const data = await paymentService.checkStatus(orderNumber)
        if (cancelled) return true
        return applyData(data)
      } catch (error: unknown) {
        if (cancelled) return true
        if (isOrderAccessRequired(error)) {
          forgetOrderAccess(orderNumber)
          setAuthorizedOrder('')
          setAccessRequired(true)
          return true
        }
        return false
      }
    }

    async function loop(elapsed: number) {
      if (cancelled) return
      const terminal = await check()
      if (terminal || cancelled) return
      const isNequi = methodType === 'NEQUI'
      const next = isNequi
        ? (elapsed >= NEQUI_TIMEOUT_SECONDS * 1000 ? -1 : 3000)
        : nextBackoffDelay(elapsed)
      if (next < 0) return
      timer = setTimeout(() => loop(elapsed + next), next)
    }

    function nextBackoffDelay(elapsed: number): number {
      const points = [0, 2000, 7000, 17000, 37000]
      for (let i = 0; i < points.length - 1; i++) {
        if (elapsed >= points[i] && elapsed < points[i + 1]) {
          return points[i + 1] - elapsed
        }
      }
      return -1
    }

    timer = setTimeout(() => loop(1500), 1500)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [outcome, orderNumber, methodType, accessChecked, accessRequired])

  useEffect(() => {
    if (!isNequiPending || !accessChecked || accessRequired) return
    const start = Date.now()
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000)
      const left = NEQUI_TIMEOUT_SECONDS - elapsed
      setNequiSecondsLeft(left > 0 ? left : 0)
      if (left <= 0) clearInterval(tick)
    }, 1000)
    return () => clearInterval(tick)
  }, [isNequiPending, accessChecked, accessRequired])

  if (accessRequired) {
    return <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}><OrderAccessRecovery key={orderNumber} orderNumber={orderNumber} onAccessGranted={() => setAccessAttempt((attempt) => attempt + 1)} /></main>
  }
  if (!accessChecked) {
    return <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}><p role={accessError ? 'alert' : 'status'}>{accessError || (orderNumber ? 'Consultando el pedido...' : 'Selecciona un pedido para consultar su confirmación.')}</p>{accessError && <button type="button" onClick={() => setAccessAttempt((attempt) => attempt + 1)}>Volver a intentar</button>}<Link href="/cart">Volver al carrito</Link></main>
  }

  if (isNequiPending) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--cream-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ maxWidth: 520, width: '100%' }}>

          {/* Nequi spinning icon */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #FDF0FF', borderTopColor: '#E0AAFF', animation: 'nequiSpin 1.2s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 16px rgba(224,170,255,.35)' }}>
                <Image src="/mimittos/payments/nequi.jpeg" alt="Nequi" width={96} height={96} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
              </div>
            </div>
            <style jsx>{`
              @keyframes nequiSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--navy)', margin: '0 0 10px', lineHeight: 1.25 }}>
              Esperando aprobación en Nequi
            </h1>
            {orderNumber && (
              <div style={{ display: 'inline-block', background: 'var(--pink-melo)', borderRadius: 999, padding: '6px 16px', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--terracotta)', marginBottom: 12 }}>
                {orderNumber}
              </div>
            )}
            <p style={{ color: 'var(--gray-warm)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
              Abre tu app Nequi y aprueba el cobro{amountInCents > 0 ? <> de <strong style={{ color: 'var(--navy)' }}>{fmtCop(amountInCents)}</strong></> : ''} para confirmar tu pedido.
            </p>
          </div>

          {/* Countdown card */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(27,42,74,.07)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: nequiSecondsLeft > 60 ? '#FDF0FF' : '#FFF8E1', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={nequiSecondsLeft > 60 ? '#A050C0' : '#F57F17'} strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>
                {nequiSecondsLeft > 0 ? `Tiempo restante: ${fmtMmSs(nequiSecondsLeft)}` : 'Tiempo agotado'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.4 }}>
                {nequiSecondsLeft > 0
                  ? 'Si no apruebas en este tiempo, Nequi rechaza el pago automáticamente.'
                  : 'Si Nequi no notificó la aprobación en este lapso, el pago se considera rechazado.'}
              </div>
            </div>
          </div>

          {/* Tip card */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 24, boxShadow: '0 2px 12px rgba(27,42,74,.07)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--cream-peach)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: 'var(--navy)', fontSize: 14, marginBottom: 4 }}>
                ¿No te llegó la notificación?
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.5 }}>
                Abre tu app Nequi → Inicio → busca la solicitud de pago de MIMITTOS y aprueba el cobro.
              </div>
            </div>
          </div>

          {/* Quiet status note */}
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--gray-warm)' }}>
            Esta página se actualiza sola. Cuando apruebes en Nequi, te confirmamos el pedido aquí mismo.
          </div>

        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cream-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: confirmed ? '#E8F5E9' : declined ? '#FFEBEE' : 'var(--cream-peach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {confirmed ? (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : declined ? (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 800, fontSize: 30, color: 'var(--navy)', margin: '0 0 10px', lineHeight: 1.2 }}>
            {confirmed ? '¡Pedido confirmado!' : declined ? 'Pago rechazado' : '¡Gracias por tu pedido!'}
          </h1>
          {orderNumber && (
            <div style={{ display: 'inline-block', background: 'var(--pink-melo)', borderRadius: 999, padding: '6px 16px', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--terracotta)', marginBottom: 12 }}>
              {orderNumber}
            </div>
          )}
          <p style={{ color: 'var(--gray-warm)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            {confirmed
              ? 'Tu abono fue procesado exitosamente. Comenzaremos a producir tu peluche muy pronto.'
              : declined
                ? 'Tu pago no se completó. Tus productos siguen en el carrito y puedes intentar de nuevo cuando quieras.'
                : 'Tu pedido fue registrado. Cuando Wompi confirme el pago te enviaremos un correo y comenzamos producción.'}
          </p>
        </div>

        {/* Payment status */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(27,42,74,.07)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: confirmed ? '#E8F5E9' : declined ? '#FFEBEE' : '#FFF8E1', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {confirmed ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
            ) : declined ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F57F17" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            )}
          </div>
          <div>
            <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: confirmed ? '#2E7D32' : declined ? '#C62828' : '#F57F17' }}>
              {confirmed ? 'Pago confirmado' : declined ? 'Pago rechazado por la pasarela' : 'Pago en proceso'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.4 }}>
              {confirmed
                ? 'El abono del 50% fue acreditado.'
                : declined
                  ? declineReason || 'Wompi reportó que el pago no se pudo procesar. Puedes intentar con otro método.'
                  : 'Wompi nos notificará cuando acrediten el pago. No necesitas esperar aquí.'}
            </div>
          </div>
        </div>

        {/* Email info — solo si no fue rechazado */}
        {!declined && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(27,42,74,.07)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--cream-peach)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: 'var(--navy)', fontSize: 15, marginBottom: 3 }}>Revisa tu correo</div>
              <div style={{ fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.5 }}>
                Te enviamos un resumen del pedido con todos los detalles.
              </div>
            </div>
          </div>
        )}

        {/* Guest register banner — solo si no fue rechazado */}
        {isGuest && !declined && (
          <div style={{ background: '#EDE7F6', border: '1px solid #B39DDB', borderRadius: 16, padding: '18px 20px', marginBottom: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#B39DDB', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4527A0" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: '#4527A0', fontSize: 15, marginBottom: 3 }}>
                ¡Crea tu cuenta y ve tus pedidos!
              </div>
              <div style={{ fontSize: 13, color: '#512DA8', lineHeight: 1.5, marginBottom: 10 }}>
                Regístrate con{customerEmail ? <> el correo <strong>{customerEmail}</strong></> : ' el correo que usaste para comprar'} y este pedido aparecerá automáticamente en tu perfil.
              </div>
              <Link
                href={`/sign-up${customerEmail ? `?email=${encodeURIComponent(customerEmail)}` : ''}`}
                style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 999, background: '#512DA8', color: '#fff', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
              >
                Crear cuenta →
              </Link>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {declined ? (
            <>
              <Link href="/cart"
                style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 20px', borderRadius: 14, background: 'var(--coral)', color: '#fff', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 24px rgba(212,132,138,.35)' }}>
                Volver al carrito
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link href="/catalog"
                style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', borderRadius: 14, background: '#fff', color: 'var(--navy)', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 2px 12px rgba(27,42,74,.08)' }}>
                Seguir comprando
              </Link>
            </>
          ) : (
            <>
              <Link href={`/tracking?order=${orderNumber}`}
                style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 20px', borderRadius: 14, background: 'var(--coral)', color: '#fff', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 24px rgba(212,132,138,.35)' }}>
                Ver estado del pedido
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link href="/"
                style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', borderRadius: 14, background: '#fff', color: 'var(--navy)', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 2px 12px rgba(27,42,74,.08)' }}>
                Seguir comprando
              </Link>
            </>
          )}
        </div>

      </div>
    </main>
  )
}

export default function OrderConfirmedPage() {
  return (
    <Suspense>
      <OrderConfirmedContent />
    </Suspense>
  )
}
