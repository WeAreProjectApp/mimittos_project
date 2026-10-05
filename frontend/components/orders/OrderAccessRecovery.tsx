'use client'

import { type FormEvent, useId, useState } from 'react'

import { orderAccessService } from '@/lib/services/orderAccessService'
import { storeOrderAccess } from '@/lib/utils/orderAccess'

export default function OrderAccessRecovery({ orderNumber, onAccessGranted }: {
  orderNumber: string
  onAccessGranted: () => void
}) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function requestCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await orderAccessService.requestCode(orderNumber, email.trim())
      setRequested(true)
      setMessage('Si los datos coinciden, recibirás un código en el correo del pedido. Revisa también spam. Para reenviar, espera al menos un minuto.')
    } catch {
      setError('No pudimos solicitar el código. Intenta de nuevo más tarde.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const access = await orderAccessService.verifyCode(orderNumber, email.trim(), code)
      storeOrderAccess(orderNumber, access)
      setCode('')
      onAccessGranted()
    } catch {
      setError('No pudimos verificar el código. Revisa los datos o solicita uno nuevo más tarde.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-testid="order-access-recovery" aria-labelledby={`${id}-title`} style={{ background: '#fff', borderRadius: 16, padding: 24, margin: '20px 0', boxShadow: 'var(--shadow-sm)' }}>
      <h2 id={`${id}-title`} style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--navy)', marginBottom: 10 }}>Accede a tu pedido</h2>
      <p style={{ color: 'var(--gray-warm)', fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>Ingresa el correo que usaste al comprar. No necesitas crear una cuenta.</p>
      <form onSubmit={requestCode} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor={`${id}-email`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Correo del pedido</label>
        <input id={`${id}-email`} data-testid="order-access-email-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} />
        <button data-testid="order-access-request-button" type="submit" disabled={busy} style={buttonStyle}>{requested ? 'Reenviar código' : 'Enviar código'}</button>
      </form>
      {message && <p role="status" style={{ color: 'var(--gray-warm)', fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>{message}</p>}
      {requested && (
        <form onSubmit={verifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <label htmlFor={`${id}-code`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Código de 6 dígitos</label>
          <input id={`${id}-code`} data-testid="order-access-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} style={inputStyle} />
          <button data-testid="order-access-verify-button" type="submit" disabled={busy || code.length !== 6} style={buttonStyle}>{busy ? 'Verificando...' : 'Verificar código'}</button>
        </form>
      )}
      {error && <p role="alert" style={{ color: '#c23b3b', fontSize: 13, marginTop: 12 }}>{error}</p>}
    </section>
  )
}

const inputStyle = { width: '100%', minWidth: 0, border: '1.5px solid rgba(27,42,74,.12)', borderRadius: 10, padding: '11px 12px', color: 'var(--navy)', fontSize: 14 }
const buttonStyle = { width: '100%', border: 'none', borderRadius: 10, padding: '12px 16px', background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }
