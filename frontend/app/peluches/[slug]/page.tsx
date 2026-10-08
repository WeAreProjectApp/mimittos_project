'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { mediaService } from '@/lib/services/mediaService'
import { peluchService } from '@/lib/services/peluchService'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCartStore } from '@/lib/stores/cartStore'
import { usePageView } from '@/lib/hooks/usePageView'
import { computeDeposit } from '@/lib/utils/pricing'
import type { CartItem, PeluchDetail, PeluchSizePrice, Review } from '@/lib/types'

const BADGE_LABELS: Record<string, string> = {
  bestseller: 'Más vendido',
  new: 'Nuevo',
  limited_edition: 'Edición limitada',
}

const HUELLA_TYPES = [
  { id: 'name', label: 'Nombre', placeholder: 'Escribe el nombre aquí...' },
  { id: 'date', label: 'Fecha', placeholder: 'Ej: 14/04/2026' },
  { id: 'letter', label: 'Inicial', placeholder: 'Una letra...' },
  { id: 'image', label: 'Imagen', placeholder: '' },
]

function fmt(n: number | undefined | null) {
  return '$' + (n ?? 0).toLocaleString('es-CO')
}

function effectivePrice(base: number, discountPct: number) {
  return discountPct > 0 ? Math.round(base * (100 - discountPct) / 100) : base
}

function describeValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(describeValue).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${describeValue(val)}`)
      .join(' · ')
  }
  return ''
}

function flattenDescription(d: unknown): string[] {
  if (d == null) return []
  if (typeof d === 'string') return [d]
  if (Array.isArray(d)) return d.map(describeValue).filter(Boolean)
  if (typeof d === 'object') {
    const out: string[] = []
    for (const [, val] of Object.entries(d as Record<string, unknown>)) {
      const text = describeValue(val)
      if (text) out.push(text)
    }
    return out
  }
  return []
}

function flattenSpecs(s: unknown): Array<[string, string]> {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return []
  return Object.entries(s as Record<string, unknown>)
    .map(([k, v]) => [k, describeValue(v)] as [string, string])
    .filter(([, v]) => v.length > 0)
}

export default function PeluchDetailPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const addToCart = useCartStore((s) => s.addToCart)
  const updatePersonalization = useCartStore((s) => s.updatePersonalization)
  const cartItems = useCartStore((s) => s.items)
  const { isAuthenticated } = useAuthStore()

  usePageView(slug)

  const [peluch, setPeluch] = useState<PeluchDetail | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Review form
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewHover, setReviewHover] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewDone, setReviewDone] = useState(false)

  const [activeSizeIdx, setActiveSizeIdx] = useState(0)
  const [activeColorIdx, setActiveColorIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [activeTab, setActiveTab] = useState(0)
  const [activeImg, setActiveImg] = useState(0)
  const [addedToast, setAddedToast] = useState(false)
  const [editingItem, setEditingItem] = useState<CartItem | null>(null)

  // Huella
  const [huellaType, setHuellaType] = useState<'name' | 'date' | 'letter' | 'image'>('name')
  const [huellaText, setHuellaText] = useState('')
  const [huellaMediaId, setHuellaMediaId] = useState<number | null>(null)
  const [huellaMediaToken, setHuellaMediaToken] = useState<string | null>(null)
  const [huellaUploading, setHuellaUploading] = useState(false)
  const [huellaError, setHuellaError] = useState('')
  const huellaInputRef = useRef<HTMLInputElement>(null)

  // Corazón
  const [corazonPhrase, setCorazonPhrase] = useState('')

  // Audio
  const [audioMediaId, setAudioMediaId] = useState<number | null>(null)
  const [audioMediaToken, setAudioMediaToken] = useState<string | null>(null)
  const [audioUploading, setAudioUploading] = useState(false)
  const [audioFileName, setAudioFileName] = useState('')
  const [audioError, setAudioError] = useState('')
  const [audioMeta, setAudioMeta] = useState<{ url: string; durationSec: number | null; sizeKb: number } | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!slug) return
    Promise.all([
      peluchService.getPeluchBySlug(slug),
      peluchService.getReviews(slug),
    ])
      .then(([p, r]) => {
        setPeluch(p)
        setReviews(r)
      })
      .catch(() => setError('No encontramos este peluche.'))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!peluch) return
    const itemKey = new URLSearchParams(window.location.search).get('cartItem')
    const item = cartItems.find((line) =>
      line.peluch_slug === slug && `${line.peluch_id}-${line.size_id}-${line.color_id}` === itemKey
    )
    if (!item) return
    const sizes = peluch.size_prices
      .filter((sp) => sp.is_available)
      .sort((a, b) => parseInt(a.size.cm, 10) - parseInt(b.size.cm, 10))
    const sizeIndex = sizes.findIndex((sp) => sp.size.id === item.size_id)
    const colorIndex = peluch.available_colors.findIndex((color) => color.id === item.color_id)
    if (sizeIndex < 0 || colorIndex < 0) return
    setEditingItem(item)
    setActiveSizeIdx(sizeIndex)
    setActiveColorIdx(colorIndex)
    setQty(item.quantity)
    setHuellaType(item.huella_type || 'name')
    setHuellaText(item.has_huella ? item.huella_text : '')
    setHuellaMediaId(item.has_huella ? item.huella_media_id : null)
    setHuellaMediaToken(item.has_huella ? item.huella_media_token ?? null : null)
    setCorazonPhrase(item.has_corazon ? item.corazon_phrase : '')
    setAudioMediaId(item.has_audio ? item.audio_media_id : null)
    setAudioMediaToken(item.has_audio ? item.audio_media_token ?? null : null)
  }, [peluch, slug, cartItems])

  if (loading) {
    return (
      <main className="mx-auto px-4 sm:px-8 lg:px-10" style={{ maxWidth: 1360, marginTop: 100, textAlign: 'center', color: 'var(--gray-warm)' }}>
        Cargando...
      </main>
    )
  }

  if (error || !peluch) {
    return (
      <main className="mx-auto px-4 sm:px-8 lg:px-10" style={{ maxWidth: 1360, marginTop: 100, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🧸</div>
        <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: 'var(--navy)', marginTop: 16 }}>
          {error || 'Peluche no encontrado'}
        </h2>
        <Link href="/catalog" style={{ color: 'var(--coral)', fontWeight: 700, marginTop: 12, display: 'inline-block' }}>
          Ver catálogo →
        </Link>
      </main>
    )
  }

  // Solo las tallas habilitadas para este producto, ordenadas de menor a mayor
  // por los centímetros extraídos del texto "X cm" de GlobalSize.cm.
  const availableSizes = peluch.size_prices
    .filter((sp) => sp.is_available)
    .sort((a, b) => parseInt(a.size.cm, 10) - parseInt(b.size.cm, 10))
  const activeSizePrice: PeluchSizePrice | undefined = availableSizes[activeSizeIdx]
  const activeColor = peluch.available_colors[activeColorIdx]
  const colorImages = activeColor?.images?.map((img) => img.url) ?? []
  const gallery = colorImages.length > 0
    ? colorImages
    : peluch.gallery_urls.length > 0 ? peluch.gallery_urls : ['/mimittos/prod-01.svg']

  const userHasHuella = peluch.has_huella && (
    huellaType !== 'image' ? huellaText.trim() !== '' : huellaMediaId !== null
  )
  const userHasCorazon = peluch.has_corazon && corazonPhrase.trim() !== ''
  const userHasAudio = peluch.has_audio && audioMediaId !== null

  const personalizationCost =
    (userHasHuella ? peluch.huella_extra_cost : 0) +
    (userHasCorazon ? peluch.corazon_extra_cost : 0) +
    (userHasAudio ? peluch.audio_extra_cost : 0)

  const personalizationBreakdown: Array<{ icon: string; label: string; cost: number }> = []
  if (userHasHuella && peluch.huella_extra_cost > 0) personalizationBreakdown.push({ icon: '🐾', label: 'Huella', cost: peluch.huella_extra_cost })
  if (userHasCorazon && peluch.corazon_extra_cost > 0) personalizationBreakdown.push({ icon: '💖', label: 'Corazón personalizado', cost: peluch.corazon_extra_cost })
  if (userHasAudio && peluch.audio_extra_cost > 0) personalizationBreakdown.push({ icon: '🔊', label: 'Audio personalizado', cost: peluch.audio_extra_cost })

  const unitPrice = effectivePrice(activeSizePrice?.price ?? peluch.min_price ?? 0, peluch.discount_pct)
  const total = (unitPrice + personalizationCost) * qty
  const depositPct = activeSizePrice?.deposit_percentage ?? 50
  const deposit = computeDeposit(total, depositPct)

  function uploadErrorMessage(err: unknown, fallback: string) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    return detail ?? fallback
  }

  async function handleHuellaImageUpload(file: File) {
    setHuellaUploading(true)
    setHuellaError('')
    try {
      const result = await mediaService.uploadImage(file)
      setHuellaMediaId(result.media_id)
      setHuellaMediaToken(result.media_token)
    } catch (err: unknown) {
      setHuellaMediaId(null)
      setHuellaMediaToken(null)
      setHuellaError(uploadErrorMessage(err, 'No se pudo subir la imagen. Intenta de nuevo.'))
    } finally {
      setHuellaUploading(false)
    }
  }

  async function handleAudioUpload(file: File) {
    const MAX_AUDIO_MB = 10
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
      setAudioError(`El archivo es demasiado grande. Máximo ${MAX_AUDIO_MB}MB.`)
      return
    }
    setAudioUploading(true)
    setAudioError('')
    setAudioFileName(file.name)
    try {
      const result = await mediaService.uploadAudio(file)
      setAudioMediaId(result.media_id)
      setAudioMediaToken(result.media_token)
      setAudioMeta({ url: result.file_url, durationSec: result.duration_sec, sizeKb: result.file_size_kb })
    } catch (err: unknown) {
      setAudioFileName('')
      setAudioMediaId(null)
      setAudioMediaToken(null)
      setAudioMeta(null)
      setAudioError(uploadErrorMessage(err, 'No se pudo subir el audio. Intenta de nuevo.'))
    } finally {
      setAudioUploading(false)
    }
  }

  function handleAdd() {
    if (!peluch || !activeSizePrice || !activeColor) return

    const cartItem: CartItem = {
      peluch_id: peluch.id,
      peluch_slug: peluch.slug,
      title: peluch.title,
      size_id: activeSizePrice.size.id,
      size_label: activeSizePrice.size.label,
      color_id: activeColor.id,
      color_name: activeColor.name,
      color_hex: activeColor.hex_code,
      unit_price: unitPrice,
      personalization_cost: personalizationCost,
      quantity: qty,
      gallery_urls: gallery,
      has_huella: userHasHuella,
      huella_type: userHasHuella ? huellaType : '',
      huella_text: userHasHuella && huellaType !== 'image' ? huellaText : '',
      huella_media_id: userHasHuella && huellaType === 'image' ? huellaMediaId : null,
      huella_media_token: userHasHuella && huellaType === 'image' ? huellaMediaToken : null,
      has_corazon: userHasCorazon,
      corazon_phrase: userHasCorazon ? corazonPhrase : '',
      has_audio: userHasAudio,
      audio_media_id: userHasAudio ? audioMediaId : null,
      audio_media_token: userHasAudio ? audioMediaToken : null,
      deposit_percentage: activeSizePrice.deposit_percentage ?? 50,
      full_payment_discount_pct: activeSizePrice.full_payment_discount_pct ?? 0,
      free_shipping: activeSizePrice.free_shipping ?? false,
      shipping_cost: activeSizePrice.shipping_cost ?? 0,
    }

    if (editingItem) {
      updatePersonalization(cartItem)
      router.push('/checkout')
      return
    }
    addToCart(cartItem)
    setAddedToast(true)
    setTimeout(() => setAddedToast(false), 2500)
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!peluch || reviewRating === 0 || reviewComment.trim().length < 10) return
    setReviewSubmitting(true)
    setReviewError('')
    try {
      await peluchService.createReview(peluch.slug, { rating: reviewRating, comment: reviewComment.trim() })
      setReviewDone(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setReviewError(msg ?? 'No se pudo enviar la reseña. Intenta de nuevo.')
    } finally {
      setReviewSubmitting(false)
    }
  }

  const TABS = ['Descripción', 'Especificaciones', 'Cuidados']
  const descriptionParagraphs = flattenDescription(peluch.description)
  const specEntries = flattenSpecs(peluch.specifications)
  const careInstructions = Array.isArray(peluch.care_instructions)
    ? peluch.care_instructions.map(describeValue).filter(Boolean)
    : []

  return (
    <main>
      {/* Breadcrumb */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10 py-5" style={{ maxWidth: 1360, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-warm)' }}>
        <Link href="/" style={{ color: 'var(--gray-warm)' }}>Inicio</Link>
        <span style={{ opacity: .5 }}>/</span>
        <Link href="/catalog" style={{ color: 'var(--gray-warm)' }}>Catálogo</Link>
        <span style={{ opacity: .5 }}>/</span>
        <b style={{ color: 'var(--navy)', fontWeight: 700 }}>{peluch.title}</b>
      </div>

      {/* Product wrap */}
      <div className="mx-auto px-4 sm:px-8 lg:px-10 pb-16 grid lg:grid-cols-2 gap-8 lg:gap-14" style={{ maxWidth: 1360, alignItems: 'flex-start' }}>

        {/* Gallery */}
        <div style={{ position: 'sticky', top: 110 }}>
          <div style={{ aspectRatio: '1/1', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: activeColor ? activeColor.hex_code + '22' : 'var(--pink-melo)', boxShadow: 'var(--shadow-md)', position: 'relative', transition: 'background .3s' }}>
            {peluch.badge !== 'none' && (
              <span style={{ position: 'absolute', top: 20, right: 20, background: peluch.badge === 'limited_edition' ? 'var(--navy)' : 'var(--coral)', color: '#fff', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 999, letterSpacing: '.08em', textTransform: 'uppercase', zIndex: 1 }}>
                {BADGE_LABELS[peluch.badge]}
              </span>
            )}
            <Image src={gallery[activeImg]} alt={peluch.title} fill style={{ objectFit: 'cover' }} />
          </div>
          {gallery.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(gallery.length, 4)},1fr)`, gap: 10, marginTop: 14 }}>
              {gallery.slice(0, 4).map((src, i) => (
                <div key={i} onClick={() => setActiveImg(i)} style={{ aspectRatio: '1/1', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', border: `2.5px solid ${i === activeImg ? 'var(--coral)' : 'transparent'}`, transition: 'border-color .2s', position: 'relative' }}>
                  <Image src={src} alt="" fill style={{ objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info + config */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ background: 'var(--pink-melo)', color: 'var(--terracotta)', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 999, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {peluch.category_name}
            </span>
            {peluch.review_count > 0 && (
              <>
                <span style={{ color: 'var(--coral)', fontSize: 14, letterSpacing: 2 }}>{'★'.repeat(Math.round(peluch.average_rating))}</span>
                <span style={{ color: 'var(--gray-warm)', fontSize: 13 }}>{peluch.average_rating.toFixed(1)} · {peluch.review_count} reseñas</span>
              </>
            )}
          </div>

          <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 44, color: 'var(--navy)', lineHeight: 1.08, letterSpacing: '-.02em', marginBottom: 14 }}>
            {peluch.title}
          </h1>
          <p style={{ color: 'var(--gray-warm)', fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>
            {peluch.lead_description}
          </p>

          {/* Price */}
          <div style={{ padding: '18px 0', borderTop: '1px dashed rgba(212,132,138,.3)', borderBottom: '1px dashed rgba(212,132,138,.3)', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 38, color: 'var(--terracotta)', lineHeight: 1 }}>
                {fmt(total)}
              </div>
              {peluch.discount_pct > 0 && activeSizePrice && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: 'var(--terracotta)', color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
                    -{peluch.discount_pct}%
                  </span>
                  <span style={{ textDecoration: 'line-through', color: 'var(--gray-warm)', fontSize: 20, fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}>
                    {fmt((activeSizePrice.price + personalizationCost) * qty)}
                  </span>
                </div>
              )}
            </div>
            {personalizationBreakdown.length > 0 && (
              <div data-testid="personalization-breakdown" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--gray-warm)', fontWeight: 600 }}>Incluye personalización:</div>
                {personalizationBreakdown.map(({ icon, label, cost }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--navy)' }}>
                    <span>{icon} {label}{qty > 1 ? ` × ${qty}` : ''}</span>
                    <b style={{ color: 'var(--terracotta)', fontWeight: 700 }}>+{fmt(cost * qty)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Size */}
          {availableSizes.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={configLblStyle}>Tamaño</div>
                {activeSizePrice && (
                  <div style={{ fontSize: 14, color: 'var(--terracotta)', fontWeight: 700 }}>
                    {activeSizePrice.size.label} · {activeSizePrice.size.cm}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(availableSizes.length, 4)},1fr)`, gap: 8 }}>
                {availableSizes.map((sp, i) => (
                  <div
                    key={sp.id}
                    onClick={() => { if (!editingItem) setActiveSizeIdx(i) }}
                    style={{ border: `1.5px solid ${i === activeSizeIdx ? 'var(--coral)' : 'rgba(27,42,74,.08)'}`, padding: '14px 10px', borderRadius: 14, background: i === activeSizeIdx ? 'var(--pink-melo)' : '#fff', textAlign: 'center', cursor: editingItem ? 'default' : 'pointer', transition: 'all .2s' }}
                  >
                    <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 2 }}>{sp.size.label}</div>
                    <div style={{ fontSize: 11, color: i === activeSizeIdx ? 'var(--terracotta)' : 'var(--gray-warm)', fontWeight: i === activeSizeIdx ? 700 : 400 }}>
                      {sp.size.cm}
                      {peluch.discount_pct > 0 ? (
                        <span> · <span style={{ textDecoration: 'line-through', opacity: .6 }}>{fmt(sp.price)}</span> {fmt(effectivePrice(sp.price, peluch.discount_pct))}</span>
                      ) : (
                        <span> · {fmt(sp.price)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Color */}
          {peluch.available_colors.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={configLblStyle}>Color del peluche</div>
                {activeColor && <div style={{ fontSize: 14, color: 'var(--terracotta)', fontWeight: 700 }}>{activeColor.name}</div>}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {peluch.available_colors.map((c, i) => (
                  <div key={c.id} onClick={() => { if (!editingItem) { setActiveColorIdx(i); setActiveImg(0) } }} style={{ width: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: editingItem ? 'default' : 'pointer', transition: 'transform .2s', transform: i === activeColorIdx ? 'translateY(-2px)' : 'none' }}>
                    <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', background: c.hex_code, border: '3px solid #fff', boxShadow: i === activeColorIdx ? '0 0 0 2.5px var(--coral)' : '0 0 0 1.5px rgba(27,42,74,.1)', transition: 'box-shadow .2s' }} />
                    <span style={{ width: '100%', textAlign: 'center', fontSize: 11, color: i === activeColorIdx ? 'var(--terracotta)' : 'var(--gray-warm)', fontWeight: 600, marginTop: 6 }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personalizaciones */}
          {(peluch.has_huella || peluch.has_corazon || peluch.has_audio) && (
            <div style={{ background: 'var(--cream-peach)', borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 22 }}>
              <div style={{ ...configLblStyle, marginBottom: 14 }}>Personalización</div>
              {editingItem && <p style={{ fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Vuelve a subir los archivos necesarios y guarda la personalización. Conservaremos los productos y las cantidades de tu carrito.</p>}

              {/* Huella */}
              {peluch.has_huella && (
                <div style={{ paddingBottom: 14, borderBottom: '1px dashed rgba(212,132,138,.25)', marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
                    🐾 Huella <span style={{ color: 'var(--terracotta)', fontWeight: 400, fontSize: 13 }}>+{fmt(peluch.huella_extra_cost)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {HUELLA_TYPES.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setHuellaType(id as typeof huellaType)}
                        style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1.5px solid ${huellaType === id ? 'var(--coral)' : 'rgba(27,42,74,.1)'}`, background: huellaType === id ? 'var(--coral)' : '#fff', color: huellaType === id ? '#fff' : 'var(--navy)', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {huellaType !== 'image' && (
                    <input
                      value={huellaText}
                      onChange={(e) => setHuellaText(e.target.value)}
                      placeholder={HUELLA_TYPES.find((h) => h.id === huellaType)?.placeholder}
                      maxLength={30}
                      style={{ width: '100%', background: '#fff', border: '1.5px solid rgba(27,42,74,.08)', borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 13, color: 'var(--navy)' }}
                    />
                  )}
                  {huellaType === 'image' && (
                    <div>
                      <input ref={huellaInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleHuellaImageUpload(e.target.files[0])} />
                      <button
                        type="button"
                        onClick={() => huellaInputRef.current?.click()}
                        style={{ padding: '10px 18px', borderRadius: 10, border: `1.5px dashed ${huellaMediaId ? 'var(--coral)' : 'rgba(27,42,74,.2)'}`, background: huellaMediaId ? 'var(--pink-melo)' : '#fff', color: 'var(--navy)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {huellaUploading ? 'Subiendo...' : huellaMediaId ? '✓ Imagen subida — cambiar' : 'Subir imagen'}
                      </button>
                      {huellaError && (
                        <div role="alert" style={{ marginTop: 8, background: '#FFEBEE', color: '#C62828', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>{huellaError}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Corazón */}
              {peluch.has_corazon && (
                <div style={{ paddingBottom: 14, borderBottom: peluch.has_audio ? '1px dashed rgba(212,132,138,.25)' : 'none', marginBottom: peluch.has_audio ? 14 : 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
                    💖 Corazón personalizado <span style={{ color: 'var(--terracotta)', fontWeight: 400, fontSize: 13 }}>+{fmt(peluch.corazon_extra_cost)}</span>
                  </div>
                  <input
                    value={corazonPhrase}
                    onChange={(e) => setCorazonPhrase(e.target.value.slice(0, 50))}
                    placeholder="Una frase especial (máx. 50 caracteres)"
                    style={{ width: '100%', background: '#fff', border: '1.5px solid rgba(27,42,74,.08)', borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 13, color: 'var(--navy)' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--gray-warm)', marginTop: 4, textAlign: 'right' }}>{corazonPhrase.length}/50</div>
                </div>
              )}

              {/* Audio */}
              {peluch.has_audio && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
                    🔊 Audio personalizado <span style={{ color: 'var(--terracotta)', fontWeight: 400, fontSize: 13 }}>+{fmt(peluch.audio_extra_cost)}</span>
                  </div>
                  <input ref={audioInputRef} type="file" accept="audio/*" data-testid="audio-upload-input" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleAudioUpload(e.target.files[0])} />

                  {!audioMediaId && (
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={audioUploading}
                      style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px dashed rgba(27,42,74,.2)', background: '#fff', color: 'var(--navy)', fontWeight: 600, fontSize: 13, cursor: audioUploading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {audioUploading ? 'Subiendo audio...' : 'Subir audio (máx. 30s)'}
                    </button>
                  )}

                  {audioMediaId && (
                    <div data-testid="audio-uploaded" style={{ background: '#fff', border: '1.5px solid var(--coral)', borderRadius: 12, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ color: '#2E7D32', fontWeight: 700, fontSize: 13 }}>✓ Audio listo</span>
                        <span style={{ fontSize: 12, color: 'var(--gray-warm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {audioFileName}
                          {audioMeta?.durationSec != null ? ` · ${audioMeta.durationSec.toFixed(1)}s` : ''}
                          {audioMeta?.sizeKb != null ? ` · ${audioMeta.sizeKb} KB` : ''}
                        </span>
                      </div>
                      {audioMeta?.url && (
                        <audio data-testid="audio-player" controls src={audioMeta.url} style={{ width: '100%', height: 36 }}>
                          Tu navegador no soporta la reproducción de audio.
                        </audio>
                      )}
                      <button
                        type="button"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={audioUploading}
                        style={{ marginTop: 8, padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: '1.5px solid rgba(27,42,74,.15)', background: '#fff', color: 'var(--navy)', cursor: audioUploading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                      >
                        {audioUploading ? 'Subiendo...' : 'Cambiar audio'}
                      </button>
                    </div>
                  )}

                  {audioError && (
                    <div role="alert" style={{ marginTop: 8, background: '#FFEBEE', color: '#C62828', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>{audioError}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Qty + Add */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1.5px solid rgba(27,42,74,.08)', borderRadius: 12, padding: 4 }}>
              <button disabled={!!editingItem} onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--navy)', fontSize: 18, fontWeight: 700, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>−</button>
              <span style={{ width: 40, textAlign: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{qty}</span>
              <button disabled={!!editingItem} onClick={() => setQty(qty + 1)} style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--navy)', fontSize: 18, fontWeight: 700, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>+</button>
            </div>
            <button
              onClick={handleAdd}
              disabled={!activeSizePrice || !activeColor || huellaUploading || audioUploading}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--coral)', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 15, boxShadow: '0 8px 22px rgba(212,132,138,.35)', transition: 'all .2s', border: 'none', cursor: 'pointer', padding: '0 24px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
              {editingItem ? 'Guardar personalización' : `Agregar · ${fmt(total)}`}
            </button>
          </div>

          {/* Pay info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {[
              { icon: 'M2 5h20v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zM2 10h20', title: `Abono ${depositPct}%`, sub: `Pagas ${fmt(deposit)} hoy vía Wompi` },
              { icon: 'M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3h18z', title: 'Saldo contraentrega', sub: `Paga ${fmt(total - deposit)} al recibir` },
            ].map(({ icon, title, sub }) => (
              <div key={title} style={{ background: '#fff', border: '1px solid rgba(212,132,138,.2)', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, background: 'var(--pink-melo)', color: 'var(--coral)', borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={icon} /></svg>
                </div>
                <div>
                  <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{title}</strong>
                  <span style={{ fontSize: 12, color: 'var(--gray-warm)' }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--gray-warm)', paddingTop: 12, borderTop: '1px dashed rgba(212,132,138,.3)' }}>
            {['Producción 4-6 días', 'Envío a toda Colombia', '100% artesanal'].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8"><path d="M20 6 9 17l-5-5" /></svg>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <section className="mx-auto px-4 sm:px-8 lg:px-10 mt-10" style={{ maxWidth: 1360 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(212,132,138,.2)', marginBottom: 30 }}>
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)} style={{ padding: '14px 22px', fontSize: 15, fontWeight: 700, fontFamily: "'Quicksand', sans-serif", color: i === activeTab ? 'var(--coral)' : 'var(--gray-warm)', position: 'relative', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i === activeTab ? '3px solid var(--coral)' : '3px solid transparent', transition: 'color .2s' }}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <div style={{ marginBottom: 60, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {descriptionParagraphs.length > 0
              ? descriptionParagraphs.map((p, i) => (
                  <p key={i} style={{ color: 'var(--gray-warm)', fontSize: 15, lineHeight: 1.7 }}>{p}</p>
                ))
              : <p style={{ color: 'var(--gray-warm)', fontSize: 14 }}>Sin descripción disponible.</p>}
          </div>
        )}

        {activeTab === 1 && (
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 26, boxShadow: 'var(--shadow-sm)', maxWidth: 600, marginBottom: 60 }}>
            {specEntries.length > 0 ? specEntries.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed rgba(212,132,138,.2)', fontSize: 14, gap: 16 }}>
                <span style={{ color: 'var(--gray-warm)', flexShrink: 0 }}>{k}</span>
                <b style={{ color: 'var(--navy)', fontWeight: 700, textAlign: 'right' }}>{v}</b>
              </div>
            )) : <p style={{ color: 'var(--gray-warm)', fontSize: 14 }}>Sin especificaciones disponibles.</p>}
          </div>
        )}

        {activeTab === 2 && (
          <div style={{ marginBottom: 60 }}>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
              {careInstructions.length > 0
                ? careInstructions.map((f, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--navy)', fontWeight: 500 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                      {f}
                    </li>
                  ))
                : <li style={{ color: 'var(--gray-warm)', fontSize: 14 }}>Sin instrucciones disponibles.</li>}
            </ul>
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="mx-auto px-4 sm:px-8 lg:px-10 mb-16" style={{ maxWidth: 1360 }}>
        {reviews.length > 0 && (
          <>
            <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--navy)', marginBottom: 20 }}>
              Reseñas ({reviews.length})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16, marginBottom: 40 }}>
              {reviews.map((r) => (
                <div key={r.id} style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14 }}>
                      {r.user_name?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: 14, color: 'var(--navy)' }}>{r.user_name}</strong>
                      <span style={{ color: 'var(--coral)', fontSize: 13 }}>{'★'.repeat(r.rating)}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--gray-warm)', lineHeight: 1.6 }}>{r.comment}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Write a review */}
        {(() => {
          const alreadyReviewed = isAuthenticated && reviews.some((r) => r.is_mine)
          if (alreadyReviewed || reviewDone) {
            return reviewDone ? (
              <div style={{ background: '#F1F8E9', border: '1.5px solid #C5E1A5', borderRadius: 'var(--radius-lg)', padding: '20px 24px', maxWidth: 520, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#558B2F" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                <div>
                  <strong style={{ display: 'block', color: '#33691E', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>¡Gracias por tu reseña!</strong>
                  <span style={{ color: '#558B2F', fontSize: 13 }}>Está pendiente de aprobación y pronto aparecerá aquí.</span>
                </div>
              </div>
            ) : null
          }
          return (
            <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '28px 32px', boxShadow: 'var(--shadow-sm)', maxWidth: 560 }}>
              <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--navy)', marginBottom: 6 }}>
                Deja tu reseña
              </h3>
              <p style={{ fontSize: 13, color: 'var(--gray-warm)', marginBottom: 20 }}>
                Solo compradores verificados pueden publicar reseñas.
              </p>

              {!isAuthenticated ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'var(--cream-peach)', borderRadius: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--navy)' }}>Inicia sesión para dejar tu reseña</span>
                  <Link href="/sign-in" style={{ background: 'var(--coral)', color: '#fff', padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                    Iniciar sesión
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Star selector */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 10 }}>Tu calificación</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          onMouseEnter={() => setReviewHover(star)}
                          onMouseLeave={() => setReviewHover(0)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, lineHeight: 1, color: star <= (reviewHover || reviewRating) ? 'var(--coral)' : 'rgba(27,42,74,.15)', transition: 'color .15s', padding: '0 2px' }}
                          aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Tu comentario</div>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Cuéntanos cómo fue tu experiencia con este peluche... (mínimo 10 caracteres)"
                      rows={4}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid rgba(27,42,74,.12)', fontSize: 13, fontFamily: 'inherit', color: 'var(--navy)', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>

                  {reviewError && (
                    <div style={{ background: '#FFEBEE', color: '#C62828', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                      {reviewError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={reviewRating === 0 || reviewComment.trim().length < 10 || reviewSubmitting}
                    style={{ alignSelf: 'flex-start', padding: '11px 28px', background: 'var(--coral)', color: '#fff', border: 'none', borderRadius: 12, fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, cursor: reviewRating > 0 && reviewComment.trim().length >= 10 ? 'pointer' : 'not-allowed', opacity: reviewRating === 0 || reviewComment.trim().length < 10 || reviewSubmitting ? .55 : 1, transition: 'opacity .2s' }}
                  >
                    {reviewSubmitting ? 'Enviando...' : 'Publicar reseña'}
                  </button>
                </form>
              )}
            </div>
          )
        })()}
      </section>

      {/* Toast */}
      {addedToast && (
        <div style={{ position: 'fixed', top: 90, left: '50%', transform: 'translateX(-50%)', background: '#fff', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-lg)', zIndex: 100, borderLeft: '4px solid #4CAF50' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#E8F5E9', color: '#4CAF50', display: 'grid', placeItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <div>
            <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>¡Agregado al carrito!</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-warm)' }}>{peluch.title} · {activeSizePrice?.size.label} · {activeColor?.name}</span>
          </div>
          <Link href="/cart" style={{ background: 'var(--coral)', color: '#fff', padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, marginLeft: 8 }}>Ver carrito</Link>
        </div>
      )}
    </main>
  )
}

const configLblStyle: React.CSSProperties = {
  fontFamily: "'Quicksand', sans-serif",
  fontWeight: 700,
  fontSize: 14,
  color: 'var(--navy)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
}
