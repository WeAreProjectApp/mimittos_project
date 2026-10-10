'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react'
import ReCAPTCHA from 'react-google-recaptcha'

import { useAuthStore } from '@/lib/stores/authStore'
import { api } from '@/lib/services/http'

function SignUpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signUp, verifyRegistration, resendVerification } = useAuthStore()

  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [pendingEmail, setPendingEmail] = useState('')

  // form fields
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [newsletter, setNewsletter] = useState(true)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [siteKey, setSiteKey] = useState<string>('')

  // verify step
  const [code, setCode] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const recaptchaRef = useRef<ReCAPTCHA>(null)

  const pwStrength = (() => {
    let s = 0
    if (password.length >= 8) s++
    if (/[A-Z]/.test(password)) s++
    if (/[0-9]/.test(password)) s++
    if (/[^A-Za-z0-9]/.test(password)) s++
    return s
  })()

  const pwHint = pwStrength < 2 ? 'Contraseña débil' : pwStrength < 3 ? 'Contraseña media' : pwStrength < 4 ? 'Contraseña buena' : '¡Contraseña excelente! 💪'
  const pwColor = pwStrength < 2 ? '#E53935' : pwStrength < 3 ? '#FB8C00' : pwStrength < 4 ? '#43A047' : '#2E7D32'
  const meterColors = ['rgba(27,42,74,.1)', 'rgba(27,42,74,.1)', 'rgba(27,42,74,.1)', 'rgba(27,42,74,.1)'].map((_, i) => i < pwStrength ? (pwStrength < 2 ? '#E53935' : pwStrength < 3 ? '#FB8C00' : pwStrength < 4 ? '#FDD835' : '#43A047') : 'rgba(27,42,74,.1)')

  useEffect(() => {
    api.get('google-captcha/site-key/')
      .then((res) => setSiteKey(res.data.site_key || ''))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      setLoading(false)
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      setLoading(false)
      return
    }
    if (!termsAccepted) {
      setError('Debes aceptar los Términos y Condiciones')
      setLoading(false)
      return
    }
    if (siteKey && !captchaToken) {
      setError('Por favor completa el captcha')
      setLoading(false)
      return
    }

    try {
      const result = await signUp({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        captcha_token: captchaToken ?? undefined,
      })
      setPendingEmail(result.email)
      setStep('verify')
      setResendCooldown(60)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear la cuenta')
      recaptchaRef.current?.reset()
      setCaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  const onVerify = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await verifyRegistration({ email: pendingEmail, code, new_password: password })
      setPassword('')
      setConfirmPassword('')
      router.replace('/orders')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código inválido o expirado')
    } finally {
      setLoading(false)
    }
  }

  const onResend = async () => {
    if (resendCooldown > 0) return
    try {
      await resendVerification(pendingEmail)
      setResendCooldown(60)
    } catch {
      // silently ignore
    }
  }

  if (step === 'verify') {
    return (
      <main style={{ background: 'linear-gradient(135deg,var(--cream-warm) 0%,var(--pink-melo) 100%)', minHeight: 'calc(100vh - 88px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 40, boxShadow: '0 20px 60px -20px rgba(27,42,74,.2)', maxWidth: 420, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--cream-peach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--navy)', margin: '0 0 8px' }}>
              Verifica tu correo
            </h2>
            <p style={{ fontSize: 14, color: 'var(--gray-warm)', lineHeight: 1.6, margin: 0 }}>
              Enviamos un código de 6 dígitos a<br />
              <strong style={{ color: 'var(--navy)' }}>{pendingEmail}</strong>
            </p>
          </div>

          <form onSubmit={onVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Código de verificación</label>
              <input
                data-testid="registration-code-input"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
                style={{ ...inputStyle, textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '0.3em', paddingLeft: 15 }}
              />
              <p style={{ fontSize: 12, color: 'var(--gray-warm)', marginTop: 6 }}>
                Revisa tu bandeja de entrada y la carpeta de spam.
              </p>
            </div>

            {error && <p style={{ fontSize: 13, color: '#C62828', background: '#FFEBEE', padding: '8px 12px', borderRadius: 10 }}>{error}</p>}

            <button type="submit" disabled={loading || code.length < 6} style={{ width: '100%', padding: 15, borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, cursor: (loading || code.length < 6) ? 'not-allowed' : 'pointer', opacity: (loading || code.length < 6) ? .6 : 1 }}>
              {loading ? 'Verificando...' : 'Activar mi cuenta ♡'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--gray-warm)' }}>
            ¿No recibiste el código?{' '}
            {resendCooldown > 0 ? (
              <span style={{ color: 'var(--gray-warm)' }}>Reenviar en {resendCooldown}s</span>
            ) : (
              <button onClick={onResend} style={{ background: 'none', border: 'none', color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0 }}>
                Reenviar código
              </button>
            )}
          </p>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
            <button onClick={() => { setStep('form'); setCode(''); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--gray-warm)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
              ← Cambiar correo
            </button>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: 'linear-gradient(135deg,var(--cream-warm) 0%,var(--pink-melo) 100%)', minHeight: 'calc(100vh - 88px)' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-10 mx-auto px-4 sm:px-8 py-10 md:py-[40px]" style={{ maxWidth: 1200 }}>
      {/* Left — marketing, hidden on mobile */}
      <div className="hidden md:block">
        <div style={{ width: 120, height: 120, marginBottom: 28, animation: 'floatY 4s ease-in-out infinite', position: 'relative' }}>
          <Image src="/mimittos/logo-dark-big.png" alt="MIMITTOS" fill style={{ objectFit: 'contain' }} />
        </div>
        <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 44, color: 'var(--navy)', lineHeight: 1.1, marginBottom: 16 }}>
          Únete a la familia <em style={{ color: 'var(--coral)', fontStyle: 'normal' }}>MIMITTOS</em> 🌸
        </h1>
        <p style={{ fontSize: 16, color: 'var(--gray-warm)', maxWidth: 440, lineHeight: 1.6, marginBottom: 32 }}>
          Crea tu cuenta y empieza a diseñar peluches únicos hechos a mano, solo para ti o para alguien especial.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /></svg>, title: 'Historial completo', desc: 'Revisa, repite y descarga facturas' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>, title: 'Direcciones guardadas', desc: 'Checkout en 60 segundos' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2z" /></svg>, title: 'Notificaciones', desc: 'Te avisamos cuando tu peluche esté listo' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(255,255,255,.6)', backdropFilter: 'blur(12px)', padding: '14px 18px', borderRadius: 16, maxWidth: 420 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--coral)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</div>
              <div>
                <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: 'var(--navy)', fontSize: 14, marginBottom: 2 }}>{title}</strong>
                <span style={{ fontSize: 13, color: 'var(--gray-warm)' }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form card */}
      <div style={{ background: '#fff', borderRadius: 24, padding: 40, boxShadow: '0 20px 60px -20px rgba(27,42,74,.2)' }}>
        <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 26, color: 'var(--navy)', marginBottom: 6 }}>Únete a la familia MIMITTOS 🌸</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-warm)', marginBottom: 22 }}>Solo tomará 30 segundos.</p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Nombre</label>
              <div style={{ position: 'relative' }}>
                <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sofía" style={inputStyle} autoComplete="given-name" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Apellido</label>
              <div style={{ position: 'relative' }}>
                <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Martínez" style={inputStyle} autoComplete="family-name" />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Correo electrónico</label>
            <div style={{ position: 'relative' }}>
              <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sofia@ejemplo.com" required style={inputStyle} autoComplete="email" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Celular (para seguimiento)</label>
            <div style={{ position: 'relative' }}>
              <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" /></svg>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300 000 0000" style={inputStyle} autoComplete="tel" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required style={inputStyle} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--gray-warm)', cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
            </div>
            {password && (
              <>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {meterColors.map((c, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: c, transition: 'background .3s' }} />)}
                </div>
                <p style={{ fontSize: 11, color: pwColor, marginTop: 5 }}>{pwHint}</p>
              </>
            )}
          </div>

          <div>
            <label style={labelStyle}>Confirmar contraseña</label>
            <div style={{ position: 'relative' }}>
              <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite la contraseña" required style={inputStyle} autoComplete="new-password" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.5, cursor: 'pointer' }}>
            <div data-testid="signup-terms-toggle" onClick={() => setTermsAccepted(!termsAccepted)} style={{ width: 20, height: 20, borderRadius: 6, border: termsAccepted ? 'none' : '2px solid rgba(27,42,74,.15)', background: termsAccepted ? 'var(--coral)' : '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1, cursor: 'pointer', transition: 'all .2s' }}>
              {termsAccepted && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
            <span>Acepto los <Link href="/terms" style={{ color: 'var(--coral)', fontWeight: 700 }}>Términos y Condiciones</Link> de MIMITTOS</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.5, cursor: 'pointer' }}>
            <div onClick={() => setNewsletter(!newsletter)} style={{ width: 20, height: 20, borderRadius: 6, border: newsletter ? 'none' : '2px solid rgba(27,42,74,.15)', background: newsletter ? 'var(--coral)' : '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1, cursor: 'pointer', transition: 'all .2s' }}>
              {newsletter && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
            <span>Quiero recibir descuentos especiales y novedades de la fábrica 💌</span>
          </label>

          {siteKey && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ReCAPTCHA ref={recaptchaRef} sitekey={siteKey} onChange={(token) => setCaptchaToken(token)} onExpired={() => setCaptchaToken(null)} />
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: '#C62828', background: '#FFEBEE', padding: '8px 12px', borderRadius: 10 }}>{error}</p>}

          <button type="submit" disabled={loading} style={{ width: '100%', padding: 15, borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .6 : 1 }}>
            {loading ? 'Creando tu cuenta...' : 'Crear mi cuenta ♡'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--gray-warm)' }}>
          ¿Ya tienes cuenta? <Link href="/sign-in" style={{ color: 'var(--coral)', fontWeight: 700 }}>Inicia sesión</Link>
        </p>
      </div>
      </div>

      <style>{`@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>
    </main>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--navy)',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px 13px 44px', border: '1.5px solid rgba(27,42,74,.08)',
  borderRadius: 12, fontFamily: 'inherit', fontSize: 14, color: 'var(--navy)',
  background: 'var(--cream-warm)', outline: 'none', boxSizing: 'border-box',
}

const iconStyle: React.CSSProperties = {
  position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--gray-warm)', width: 16, height: 16,
}
