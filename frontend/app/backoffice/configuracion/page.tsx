'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { contentService } from '@/lib/services/contentService'

const PRESET_COLORS = [
  { label: 'Coral MIMITTOS', bg: '#D4848A', text: '#fff' },
  { label: 'Navy', bg: '#1B2A4A', text: '#fff' },
  { label: 'Terracotta', bg: '#B8696F', text: '#fff' },
  { label: 'Crema', bg: '#FFF0E8', text: '#1B2A4A' },
]

export default function ConfiguracionPage() {
  // Banner
  const [bannerActive, setBannerActive] = useState(false)
  const [bannerMsg, setBannerMsg] = useState('')
  const [bannerBg, setBannerBg] = useState('#D4848A')
  const [bannerText, setBannerText] = useState('#fff')
  const [bannerSaving, setBannerSaving] = useState(false)
  const [bannerOk, setBannerOk] = useState(false)
  const [bannerLoadState, setBannerLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [bannerLoadAttempt, setBannerLoadAttempt] = useState(0)

  // Hero image
  const [heroPreview, setHeroPreview] = useState<string | null>(null)
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [heroSaving, setHeroSaving] = useState(false)
  const [heroOk, setHeroOk] = useState(false)
  const [heroError, setHeroError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    contentService.get('promo_banner').then((d) => {
      if (!active) return
      const c = d.content_json as Record<string, unknown>
      setBannerActive(Boolean(c.is_active))
      setBannerMsg(String(c.message ?? ''))
      setBannerBg(String(c.bg_color ?? '#D4848A'))
      setBannerText(String(c.text_color ?? '#fff'))
      setBannerLoadState('ready')
    }).catch(() => { if (active) setBannerLoadState('error') })
    return () => { active = false }
  }, [bannerLoadAttempt])

  useEffect(() => {
    contentService.get('hero_image').then((d) => {
      const url = d.content_json?.image_url as string | undefined
      if (url) setHeroPreview(url)
    }).catch(() => null)
  }, [])

  function retryBannerLoad() {
    setBannerLoadState('loading')
    setBannerLoadAttempt((attempt) => attempt + 1)
  }

  async function saveBanner() {
    if (bannerLoadState !== 'ready') return
    setBannerSaving(true)
    setBannerOk(false)
    await contentService.update('promo_banner', {
      is_active: bannerActive,
      message: bannerMsg,
      bg_color: bannerBg,
      text_color: bannerText,
    })
    setBannerSaving(false)
    setBannerOk(true)
    setTimeout(() => setBannerOk(false), 3000)
  }

  async function uploadHero() {
    if (!heroFile) return
    setHeroSaving(true)
    setHeroError('')
    setHeroOk(false)
    try {
      const res = await contentService.uploadHeroImage(heroFile)
      setHeroPreview(res.image_url)
      setHeroFile(null)
      setHeroOk(true)
      setTimeout(() => setHeroOk(false), 3000)
    } catch {
      setHeroError('Error al subir la imagen. Verifica que sea JPG/PNG menor a 5 MB.')
    }
    setHeroSaving(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setHeroFile(f)
    setHeroPreview(URL.createObjectURL(f))
    setHeroError('')
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 780 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ color: 'var(--coral)', fontFamily: "'Quicksand', sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 6 }}>
          Configuración del sitio
        </div>
        <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--navy)', margin: 0 }}>
          Ajustes generales
        </h1>
      </div>

      {/* ── Cinta de promoción ── */}
      <section aria-label="Cinta de promoción" style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--shadow-sm)', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--navy)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          📢 Cinta de promoción
        </h2>

        {bannerLoadState === 'loading' && <p role="status">Cargando cinta…</p>}
        {bannerLoadState === 'error' && (
          <div>
            <p role="alert">No se pudo cargar la cinta de promoción. Intenta de nuevo.</p>
            <button type="button" onClick={retryBannerLoad}>Reintentar carga</button>
          </div>
        )}
        <fieldset disabled={bannerLoadState !== 'ready'} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        {/* Preview */}
        <div style={{
          height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: bannerBg, color: bannerText,
          fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 13,
          marginBottom: 22, opacity: bannerActive ? 1 : 0.35, transition: 'opacity .3s',
          border: '1px dashed rgba(0,0,0,.08)',
        }}>
          {bannerMsg || 'Vista previa del mensaje'}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, cursor: 'pointer' }}>
          <button
            type="button"
            data-testid="banner-toggle"
            onClick={() => setBannerActive(!bannerActive)}
            style={{
              width: 44, height: 24, borderRadius: 999, border: 'none', padding: 0,
              background: bannerActive ? 'var(--coral)' : 'rgba(27,42,74,.12)',
              position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: bannerActive ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s',
            }} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>
            {bannerActive ? 'Cinta activa — visible en el sitio' : 'Cinta desactivada'}
          </span>
        </label>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Mensaje</label>
          <input
            value={bannerMsg}
            onChange={(e) => setBannerMsg(e.target.value)}
            placeholder="ej: ¡Envío gratis en compras mayores a $200.000! 🎁"
            maxLength={120}
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--gray-warm)', marginTop: 4, textAlign: 'right' }}>{bannerMsg.length}/120</div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={labelStyle}>Color de fondo</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.bg}
                  onClick={() => { setBannerBg(p.bg); setBannerText(p.text) }}
                  title={p.label}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: p.bg,
                    border: bannerBg === p.bg ? '3px solid var(--navy)' : '2px solid rgba(0,0,0,.1)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <input type="color" value={bannerBg} onChange={(e) => setBannerBg(e.target.value)}
              style={{ width: 40, height: 32, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={labelStyle}>Color del texto</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {['#fff', '#1B2A4A', '#D4848A'].map((c) => (
                <button
                  key={c}
                  onClick={() => setBannerText(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c,
                    border: bannerText === c ? '3px solid var(--coral)' : '2px solid rgba(0,0,0,.1)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <input type="color" value={bannerText} onChange={(e) => setBannerText(e.target.value)}
              style={{ width: 40, height: 32, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
          </div>
        </div>

        <button onClick={saveBanner} disabled={bannerLoadState !== 'ready' || bannerSaving} style={btnPrimary}>
          {bannerSaving ? 'Guardando…' : bannerOk ? '✓ Guardado' : 'Guardar cinta'}
        </button>
        </fieldset>
      </section>

      {/* ── Imagen del hero ── */}
      <section style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--navy)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          🖼️ Imagen del hero
        </h2>

        {heroPreview && (
          <div style={{ position: 'relative', aspectRatio: '16/7', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 20, background: 'var(--pink-melo)' }}>
            <Image src={heroPreview} alt="Hero preview" fill style={{ objectFit: 'cover' }} unoptimized={heroPreview.startsWith('blob:')} />
          </div>
        )}

        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed rgba(212,132,138,.4)', borderRadius: 'var(--radius-md)',
            padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
            background: 'var(--cream-warm)', marginBottom: 16, transition: 'border-color .2s',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
          <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 4 }}>
            {heroFile ? heroFile.name : 'Haz clic para elegir una imagen'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-warm)' }}>JPG o PNG · máx. 5 MB · recomendado 1400×900 px</div>
          <input data-testid="hero-file-input" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} style={{ display: 'none' }} />
        </div>

        {heroError && <p style={{ color: '#c23b3b', fontSize: 13, marginBottom: 12 }}>{heroError}</p>}

        <button onClick={uploadHero} disabled={!heroFile || heroSaving} style={{ ...btnPrimary, opacity: !heroFile || heroSaving ? 0.5 : 1 }}>
          {heroSaving ? 'Subiendo…' : heroOk ? '✓ Imagen actualizada' : 'Subir imagen'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--gray-warm)', marginTop: 10 }}>
          La imagen se optimiza automáticamente (máx. 1400 px, calidad 82%).
        </p>
      </section>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700,
  color: 'var(--navy)', marginBottom: 8, fontFamily: "'Quicksand', sans-serif",
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid rgba(27,42,74,.12)', fontSize: 14,
  color: 'var(--navy)', fontFamily: 'inherit', outline: 'none',
  background: 'var(--cream-warm)',
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--coral)', color: '#fff',
  border: 'none', borderRadius: 12, padding: '12px 24px',
  fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
}
