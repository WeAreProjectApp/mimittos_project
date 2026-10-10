'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { peluchService } from '@/lib/services/peluchService'
import { peluchAdminService } from '@/lib/services/peluchAdminService'
import { globalPresetService } from '@/lib/services/globalPresetService'
import { buildColorImpact, buildSizeImpact, confirmDangerousDelete, notifyDeleteError } from '@/lib/utils/confirmDelete'
import { useColorImageUpload, type ColorGalleryItem } from '@/lib/hooks/useColorImageUpload'
import type { Category, GlobalColor, GlobalSize, PeluchDetail } from '@/lib/types'

interface SizePriceRow {
  size_id: number
  size_label: string
  size_cm: string
  price: string
  is_available: boolean
  deposit_percentage: string
  full_payment_discount_pct: string
  free_shipping: boolean
  shipping_cost: string
}

interface Props {
  existing?: PeluchDetail
}

const BADGE_OPTIONS = [
  { value: 'none', label: 'Sin badge' },
  { value: 'bestseller', label: 'Más vendido' },
  { value: 'new', label: 'Nuevo' },
  { value: 'limited_edition', label: 'Ed. limitada' },
]

const DESCRIPTION_TEMPLATE = [
  'Párrafo 1 de la descripción del peluche...',
  'Párrafo 2, puedes agregar más párrafos según necesites.',
]

const SPECIFICATIONS_TEMPLATE = {
  'Material': 'Felpa premium suave',
  'Relleno': 'Fibra sintética hipoalergénica',
  'Tamaño disponible': 'S, M, L',
  'País de fabricación': 'Colombia',
}

const DEFAULT_CARE = [
  'No lavar en lavadora. Limpiar con paño húmedo suave.',
  'No exponer al sol directo por periodos prolongados.',
  'Mantener alejado de fuentes de calor.',
  'En caso de mancha leve, usar paño húmedo y dejar secar al aire.',
  'No apto para menores de 3 años por piezas pequeñas.',
]

function slugify(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function tryParseJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T } catch { return null }
}

export function PeluchForm({ existing }: Props) {
  const router = useRouter()
  const colorFileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingColorSlug, setUploadingColorSlug] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [allColors, setAllColors] = useState<GlobalColor[]>([])
  const [sizePrices, setSizePrices] = useState<SizePriceRow[]>([])
  const [selectedColors, setSelectedColors] = useState<number[]>([])

  const [form, setForm] = useState({
    title: '', slug: '', category: '', lead_description: '',
    badge: 'none', is_active: true, is_featured: false,
    has_huella: false, has_corazon: false, has_audio: false,
    huella_extra_cost: '0', corazon_extra_cost: '0', audio_extra_cost: '0',
  })

  const [descriptionJson, setDescriptionJson] = useState('')
  const [specificationsJson, setSpecificationsJson] = useState('')
  const [careJson, setCareJson] = useState(JSON.stringify(DEFAULT_CARE, null, 2))

  const [jsonErrors, setJsonErrors] = useState({ description: '', specifications: '', care: '' })

  // Add color modal
  const [colorModal, setColorModal] = useState(false)
  const [newColor, setNewColor] = useState({ name: '', hex_code: '#D4848A' })
  const [savingColor, setSavingColor] = useState(false)

  // Add size modal
  const [sizeModal, setSizeModal] = useState(false)
  const [newSize, setNewSize] = useState({ label: '', cm: '' })
  const [savingSize, setSavingSize] = useState(false)

  const [discountPct, setDiscountPct] = useState(0)
  const [displayOrder, setDisplayOrder] = useState(100)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [slugManual, setSlugManual] = useState(false)

  const [draftSlug, setDraftSlug] = useState<string | null>(null)

  // Synchronous mirror of draftSlug + the in-flight create promise. Refs (not
  // state) so concurrent first-upload calls coalesce onto a single create.
  const draftSlugRef = useRef<string | null>(null)
  const draftCreatingRef = useRef<Promise<string> | null>(null)

  // Builds the payload the backend needs to create/update a peluche.
  const buildPayload = useCallback((isActive: boolean) => ({
    title: form.title,
    slug: form.slug,
    category: Number(form.category),
    lead_description: form.lead_description,
    description: tryParseJson<string[]>(descriptionJson) ?? [],
    badge: form.badge,
    is_active: isActive,
    is_featured: form.is_featured,
    discount_pct: discountPct,
    display_order: displayOrder,
    has_huella: form.has_huella,
    has_corazon: form.has_corazon,
    has_audio: form.has_audio,
    huella_extra_cost: Number(form.huella_extra_cost),
    corazon_extra_cost: Number(form.corazon_extra_cost),
    audio_extra_cost: Number(form.audio_extra_cost),
    specifications: tryParseJson<Record<string, string>>(specificationsJson) ?? {},
    care_instructions: tryParseJson<string[]>(careJson) ?? [],
    available_color_ids: selectedColors,
    size_prices_data: sizePrices.map((r) => ({
      size_id: r.size_id,
      price: r.is_available ? Number(r.price) : 0,
      is_available: r.is_available,
      deposit_percentage: Math.min(100, Math.max(1, Number(r.deposit_percentage) || 50)),
      full_payment_discount_pct: Math.min(100, Math.max(0, Number(r.full_payment_discount_pct) || 0)),
      free_shipping: r.free_shipping,
      shipping_cost: r.free_shipping ? 0 : Math.max(0, Number(r.shipping_cost) || 0),
    })),
  }), [form, descriptionJson, specificationsJson, careJson, discountPct, displayOrder, selectedColors, sizePrices])

  // Returns the slug to upload to: the existing peluche, or a draft created on
  // first call. Concurrent first-upload calls are coalesced onto one create.
  const resolveUploadSlug = useCallback(async (): Promise<string> => {
    if (existing) return existing.slug
    if (draftSlugRef.current) {
      await peluchAdminService.update(draftSlugRef.current, { available_color_ids: selectedColors })
      return draftSlugRef.current
    }
    if (!form.title.trim() || !form.slug.trim() || !form.category) {
      throw new Error('Completa título y categoría antes de subir fotos.')
    }
    if (!draftCreatingRef.current) {
      draftCreatingRef.current = peluchAdminService.create(buildPayload(false))
        .then((created) => {
          draftSlugRef.current = created.slug
          setDraftSlug(created.slug)
          return created.slug
        })
        .catch((err) => {
          // Reset so a later upload attempt can retry creating the draft.
          draftCreatingRef.current = null
          throw err
        })
    }
    return draftCreatingRef.current
  }, [existing, selectedColors, form.title, form.slug, form.category, buildPayload])

  const initialGallery = useMemo<Record<string, ColorGalleryItem[]>>(() => {
    const gallery: Record<string, ColorGalleryItem[]> = {}
    for (const c of existing?.available_colors ?? []) {
      gallery[c.slug] = (c.images ?? []).map((item, i) => ({
        key: `existing-${c.slug}-${i}`,
        id: item.id,
        url: item.url,
        status: 'done' as const,
      }))
    }
    return gallery
  }, [existing])

  const {
    colorGallery, setColorGallery, uploadFiles, retryItem, retryAll, removeImage, hasPendingWork,
  } = useColorImageUpload({ resolveUploadSlug, initialGallery })

  useEffect(() => {
    Promise.all([
      peluchService.getCategories(),
      peluchService.getColors(),
      peluchService.getSizes(),
    ]).then(([cats, colors, sizes]) => {
      setCategories(cats)
      setAllColors(colors)
      const rows: SizePriceRow[] = sizes.map((s) => ({
        size_id: s.id, size_label: s.label, size_cm: s.cm, price: '0', is_available: false,
        deposit_percentage: '50', full_payment_discount_pct: '0', free_shipping: false, shipping_cost: '0',
      }))

      if (existing) {
        setForm({
          title: existing.title,
          slug: existing.slug,
          category: String(existing.category?.id ?? ''),
          lead_description: existing.lead_description,
          badge: existing.badge,
          is_active: existing.is_active ?? true,
          is_featured: existing.is_featured,
          has_huella: existing.has_huella,
          has_corazon: existing.has_corazon,
          has_audio: existing.has_audio,
          huella_extra_cost: String(existing.huella_extra_cost ?? 0),
          corazon_extra_cost: String(existing.corazon_extra_cost ?? 0),
          audio_extra_cost: String(existing.audio_extra_cost ?? 0),
        })
        setDiscountPct(existing.discount_pct ?? 0)
        setDisplayOrder(existing.display_order ?? 100)
        setSlugManual(true)
        setSelectedColors(existing.available_colors.map((c) => c.id))
        setDescriptionJson(JSON.stringify(existing.description ?? [], null, 2))
        setSpecificationsJson(JSON.stringify(existing.specifications ?? {}, null, 2))
        setCareJson(JSON.stringify(existing.care_instructions?.length ? existing.care_instructions : DEFAULT_CARE, null, 2))

        const mergedRows = rows.map((row) => {
          const sp = existing.size_prices?.find((p) => p.size.id === row.size_id)
          return sp
            ? {
                ...row,
                price: String(sp.price),
                is_available: sp.is_available,
                deposit_percentage: String(sp.deposit_percentage ?? 50),
                full_payment_discount_pct: String(sp.full_payment_discount_pct ?? 0),
                free_shipping: sp.free_shipping ?? false,
                shipping_cost: String(sp.shipping_cost ?? 0),
              }
            : row
        })
        setSizePrices(mergedRows)

      } else {
        setSizePrices(rows)
      }
    })
  }, [existing])

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value
    setForm((p) => ({ ...p, title, slug: slugManual ? p.slug : slugify(title) }))
  }

  function validateJson(raw: string, type: 'array' | 'object'): string {
    if (!raw.trim()) return ''
    const parsed = tryParseJson<unknown>(raw)
    if (parsed === null) return 'JSON inválido — verifica la sintaxis.'
    if (type === 'array' && !Array.isArray(parsed)) return 'Debe ser un array JSON ([ ... ]).'
    if (type === 'object' && (Array.isArray(parsed) || typeof parsed !== 'object')) return 'Debe ser un objeto JSON ({ ... }).'
    return ''
  }

  function handleJsonChange(field: 'description' | 'specifications' | 'care', value: string, type: 'array' | 'object') {
    if (field === 'description') setDescriptionJson(value)
    else if (field === 'specifications') setSpecificationsJson(value)
    else setCareJson(value)
    setJsonErrors((prev) => ({ ...prev, [field]: validateJson(value, type) }))
  }

  function openColorFileInput(colorSlug: string) {
    setUploadingColorSlug(colorSlug)
    colorFileInputRef.current?.click()
  }

  async function handleColorFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const colorSlug = uploadingColorSlug
    if (!colorSlug || files.length === 0) return
    if (!existing && (!form.title.trim() || !form.slug.trim() || !form.category)) {
      setError('Completa título y categoría antes de subir fotos.')
      return
    }
    setError('')
    await uploadFiles(colorSlug, files)
  }

  async function handleColorImageRemove(colorSlug: string, item: ColorGalleryItem) {
    await removeImage(colorSlug, item.key)
  }

  async function handleAddColor() {
    if (!newColor.name.trim()) return
    setSavingColor(true)
    try {
      const created = await globalPresetService.createColor({ name: newColor.name, hex_code: newColor.hex_code })
      setAllColors((prev) => [...prev, created])
      setSelectedColors((prev) => [...prev, created.id])
      setColorGallery((prev) => ({ ...prev, [created.slug]: [] }))
      setNewColor({ name: '', hex_code: '#D4848A' })
      setColorModal(false)
    } catch { alert('No se pudo crear el color.') }
    finally { setSavingColor(false) }
  }

  async function handleAddSize() {
    if (!newSize.label.trim() || !newSize.cm.trim()) return
    setSavingSize(true)
    try {
      const created = await globalPresetService.createSize({ label: newSize.label, cm: newSize.cm })
      const newRow: SizePriceRow = {
        size_id: created.id, size_label: created.label, size_cm: created.cm, price: '0', is_available: false,
        deposit_percentage: '50', full_payment_discount_pct: '0', free_shipping: false, shipping_cost: '0',
      }
      setSizePrices((prev) => [...prev, newRow])
      setNewSize({ label: '', cm: '' })
      setSizeModal(false)
    } catch { alert('No se pudo crear la talla.') }
    finally { setSavingSize(false) }
  }

  function toggleColor(colorId: number) {
    const color = allColors.find((c) => c.id === colorId)
    if (!color) return
    const isSelected = selectedColors.includes(colorId)
    if (isSelected) {
      const images = colorGallery[color.slug] ?? []
      if (images.length > 0 && existing) {
        if (!window.confirm(`¿Quitar "${color.name}"? Se eliminarán sus ${images.length} foto(s).`)) return
        images.forEach((img) => {
          if (img.id !== null) {
            peluchAdminService.deleteColorImage(existing.slug, color.slug, img.id).catch(() => {})
          }
        })
      }
      setSelectedColors((prev) => prev.filter((c) => c !== colorId))
      setColorGallery((prev) => { const n = { ...prev }; delete n[color.slug]; return n })
    } else {
      setSelectedColors((prev) => [...prev, colorId])
      setColorGallery((prev) => ({ ...prev, [color.slug]: prev[color.slug] ?? [] }))
    }
  }

  function updateSizePrice(
    size_id: number,
    field: 'price' | 'is_available' | 'deposit_percentage' | 'full_payment_discount_pct' | 'free_shipping' | 'shipping_cost',
    value: string | boolean,
  ) {
    setSizePrices((prev) => prev.map((row) => row.size_id === size_id ? { ...row, [field]: value } : row))
  }

  async function handleDeleteColor(id: number, name: string) {
    let impact: string[] = []
    try {
      impact = buildColorImpact(await globalPresetService.getColorUsage(id))
    } catch {
      impact = []
    }
    const confirmed = await confirmDangerousDelete({ entity: 'color', name, impact })
    if (!confirmed) return
    try {
      const color = allColors.find((c) => c.id === id)
      await globalPresetService.deleteColor(id)
      setAllColors((prev) => prev.filter((c) => c.id !== id))
      setSelectedColors((prev) => prev.filter((c) => c !== id))
      if (color) setColorGallery((prev) => { const n = { ...prev }; delete n[color.slug]; return n })
    } catch {
      await notifyDeleteError('No se pudo eliminar el color.')
    }
  }

  async function handleDeleteSize(size_id: number, label: string) {
    let impact: string[] = []
    try {
      impact = buildSizeImpact(await globalPresetService.getSizeUsage(size_id))
    } catch {
      impact = []
    }
    const confirmed = await confirmDangerousDelete({ entity: 'talla', name: label, impact })
    if (!confirmed) return
    try {
      await globalPresetService.deleteSize(size_id)
      setSizePrices((prev) => prev.filter((r) => r.size_id !== size_id))
    } catch {
      await notifyDeleteError('No se pudo eliminar la talla.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.slug.trim() || !form.category) {
      setError('Título, slug y categoría son obligatorios.')
      return
    }

    const description = descriptionJson.trim() ? tryParseJson<string[]>(descriptionJson) : []
    const specifications = specificationsJson.trim() ? tryParseJson<Record<string, string>>(specificationsJson) : {}
    const care_instructions = careJson.trim() ? tryParseJson<string[]>(careJson) : []

    if (description === null) { setError('El JSON de descripción es inválido.'); return }
    if (specifications === null) { setError('El JSON de especificaciones es inválido.'); return }
    if (care_instructions === null) { setError('El JSON de cuidados es inválido.'); return }

    setSaving(true)
    try {
      if (existing) {
        await peluchAdminService.update(existing.slug, buildPayload(form.is_active))
      } else if (draftSlug) {
        // The draft already exists (images were uploaded) — finalize it.
        await peluchAdminService.update(draftSlug, buildPayload(form.is_active))
      } else {
        // No images were uploaded; create the peluche directly.
        await peluchAdminService.create(buildPayload(form.is_active))
      }
      router.push('/backoffice/peluches')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: unknown } })?.response?.data
      setError(msg ? JSON.stringify(msg) : 'No se pudo guardar el peluche.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (draftSlug && window.confirm('¿Descartar el borrador y sus fotos?')) {
      try { await peluchAdminService.delete(draftSlug) } catch { /* ignore */ }
    }
    router.push('/backoffice/peluches')
  }

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }))
  const fBool = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.checked }))

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 860 }}>

      {/* ── INFORMACIÓN BÁSICA ─────────────────────────── */}
      <Section title="Información básica">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={L}>Título *</label>
            <input value={form.title} onChange={handleTitleChange} style={I} placeholder="Osito Suave Premium" required />
          </div>
          <div>
            <label style={L}>Slug (URL) *</label>
            <input value={form.slug} onChange={(e) => { setSlugManual(true); f('slug')(e) }} style={I} placeholder="osito-suave-premium" required />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div>
            <label style={L}>Categoría *</label>
            <select value={form.category} onChange={f('category')} style={I} required>
              <option value="">Seleccionar...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={L}>Badge</label>
            <select value={form.badge} onChange={f('badge')} style={I}>
              {BADGE_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={L}>Descripción corta (aparece en la tarjeta)</label>
          <input value={form.lead_description} onChange={f('lead_description')} style={I} placeholder="Ej: El oso más suave para llevar tus recuerdos..." maxLength={280} />
          <div style={{ fontSize: 11, color: 'var(--gray-warm)', marginTop: 4, textAlign: 'right' }}>{form.lead_description.length}/280</div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <label style={CL}><input type="checkbox" checked={form.is_active} onChange={fBool('is_active')} /> Activo (visible en tienda)</label>
          <label style={CL}><input type="checkbox" checked={form.is_featured} onChange={fBool('is_featured')} /> Destacado en inicio</label>
        </div>
      </Section>

      {/* ── PRECIO Y POSICIÓN ───────────────────────────── */}
      <Section title="Precio y posición">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <label style={L}>Descuento (%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range" min={0} max={100} step={1}
                value={discountPct}
                onChange={(e) => setDiscountPct(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--coral)' }}
              />
              <input
                type="number" min={0} max={100} step={1}
                value={discountPct}
                onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                style={{ ...I, width: 68, textAlign: 'center' }}
              />
              <span style={{ fontSize: 13, color: 'var(--gray-warm)' }}>%</span>
            </div>
            {discountPct > 0 && (
              <p style={{ fontSize: 12, color: 'var(--coral)', marginTop: 6, fontWeight: 600 }}>
                -{discountPct}% — se mostrará con precio tachado en catálogo y detalle
              </p>
            )}
          </div>
          <div>
            <label style={L}>Orden de posición en catálogo</label>
            <input
              type="number" min={1} step={1}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Math.max(1, Number(e.target.value)))}
              style={I}
            />
            <p style={{ fontSize: 11, color: 'var(--gray-warm)', marginTop: 4 }}>
              Menor número = aparece primero. Por defecto: 100
            </p>
          </div>
        </div>
      </Section>

      {/* ── DESCRIPCIÓN COMPLETA ────────────────────────── */}
      <Section
        title="Descripción completa"
        action={<DownloadBtn onClick={() => downloadJson(DESCRIPTION_TEMPLATE, 'plantilla-descripcion.json')} />}
      >
        <p style={HintStyle}>
          Array JSON de párrafos. Pide a la IA: <em>"Genera la descripción en este formato JSON para un peluche llamado X"</em> usando la plantilla descargable.
        </p>
        <textarea
          value={descriptionJson}
          onChange={(e) => handleJsonChange('description', e.target.value, 'array')}
          style={{ ...I, fontFamily: 'monospace', fontSize: 12, height: 180, resize: 'vertical' }}
          placeholder={'[\n  "Párrafo 1 de la descripción...",\n  "Párrafo 2..."\n]'}
          spellCheck={false}
        />
        {jsonErrors.description && <p style={ErrStyle}>{jsonErrors.description}</p>}
      </Section>

      {/* ── TALLAS Y PRECIOS ────────────────────────────── */}
      <Section title="Tallas y precios">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {sizePrices.map((row) => (
            <div key={row.size_id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: row.is_available ? '#fff' : 'var(--cream-warm)', borderRadius: 10, border: `1.5px solid ${row.is_available ? 'rgba(212,132,138,.3)' : 'rgba(27,42,74,.06)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180, cursor: 'pointer' }}>
                  <input type="checkbox" checked={row.is_available} onChange={(e) => updateSizePrice(row.size_id, 'is_available', e.target.checked)} />
                  <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{row.size_label}</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-warm)' }}>{row.size_cm}</span>
                </label>
                <span style={{ fontSize: 13, color: 'var(--gray-warm)' }}>$</span>
                <input type="number" min={0} step={100} value={row.price} disabled={!row.is_available} onChange={(e) => updateSizePrice(row.size_id, 'price', e.target.value)} style={{ ...I, width: 140, opacity: row.is_available ? 1 : .4 }} placeholder="0" />
                <span style={{ fontSize: 12, color: 'var(--gray-warm)' }}>COP</span>
                <button
                  type="button"
                  onClick={() => handleDeleteSize(row.size_id, row.size_label)}
                  title="Eliminar esta talla globalmente"
                  style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, border: '1px solid #FFCDD2', background: '#FFF5F5', color: '#C62828', cursor: 'pointer', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                </button>
              </div>
              {row.is_available && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingLeft: 28 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-warm)' }}>
                    Anticipo %
                    <input type="number" min={1} max={100} value={row.deposit_percentage} onChange={(e) => updateSizePrice(row.size_id, 'deposit_percentage', e.target.value)} style={{ ...I, width: 70 }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-warm)' }}>
                    Desc. pago completo %
                    <input type="number" min={0} max={100} value={row.full_payment_discount_pct} onChange={(e) => updateSizePrice(row.size_id, 'full_payment_discount_pct', e.target.value)} style={{ ...I, width: 70 }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-warm)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={row.free_shipping} onChange={(e) => updateSizePrice(row.size_id, 'free_shipping', e.target.checked)} />
                    Envío gratis
                  </label>
                  {!row.free_shipping && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-warm)' }}>
                      Costo envío
                      <input type="number" min={0} value={row.shipping_cost} onChange={(e) => updateSizePrice(row.size_id, 'shipping_cost', e.target.value)} style={{ ...I, width: 110 }} placeholder="0" />
                      <span>COP</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setSizeModal(true)} style={BtnOutline}>+ Añadir nueva talla</button>
      </Section>

      {/* ── COLORES ──────────────────────────────────────── */}
      <Section title="Colores disponibles">
        <p style={HintStyle}>Selecciona los colores en que se ofrece este peluche. Luego podrás subir fotos para cada color.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {allColors.map((color) => {
            const sel = selectedColors.includes(color.id)
            return (
              <div key={color.id} style={{ display: 'flex', alignItems: 'center', borderRadius: 999, border: `2px solid ${sel ? 'var(--coral)' : 'rgba(27,42,74,.1)'}`, background: sel ? 'rgba(212,132,138,.08)' : '#fff', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleColor(color.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: color.hex_code, border: '1px solid rgba(0,0,0,.1)', flexShrink: 0 }} />
                  {color.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteColor(color.id, color.name)}
                  title="Eliminar este color globalmente"
                  style={{ padding: '6px 10px 6px 4px', background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={() => setColorModal(true)} style={BtnOutline}>+ Añadir nuevo color</button>
      </Section>

      {/* ── GALERÍA POR COLOR ────────────────────────────── */}
      {selectedColors.length > 0 && (
        <Section title="Galería de fotos por color">
          <p style={HintStyle}>Sube una o varias fotos para cada color. Las imágenes se comprimen automáticamente (máx 1400px).</p>
          {Object.values(colorGallery).some((items) => items.some((it) => it.status === 'failed')) && (
            <button type="button" onClick={() => retryAll()} style={{ ...BtnOutline, marginBottom: 12 }}>
              ⟳ Reintentar todas las imágenes fallidas
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedColors.map((colorId) => {
              const color = allColors.find((c) => c.id === colorId)
              if (!color) return null
              const images = colorGallery[color.slug] ?? []
              return (
                <div key={colorId} style={{ borderRadius: 10, border: '1.5px solid rgba(27,42,74,.08)', padding: 14, background: 'var(--cream-warm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: color.hex_code, border: '1px solid rgba(0,0,0,.1)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{color.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--gray-warm)', marginLeft: 4 }}>{images.length} foto{images.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {images.map((img) => (
                      <div key={img.key} style={{ position: 'relative', width: 90, height: 90, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${img.status === 'failed' ? '#E0A0A0' : 'rgba(27,42,74,.1)'}`, background: '#fff' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {img.status === 'uploading' && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>Subiendo...</div>
                        )}
                        {img.status === 'failed' && (
                          <button type="button" onClick={() => retryItem(color.slug, img.key)} title={img.errorMessage} style={{ position: 'absolute', inset: 0, background: 'rgba(184,105,111,.85)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                            ✗ Reintentar
                          </button>
                        )}
                        {img.status === 'done' && (
                          <span style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(46,125,50,.9)', color: '#fff', borderRadius: 4, fontSize: 9, padding: '1px 4px' }}>✓</span>
                        )}
                        <button type="button" onClick={() => handleColorImageRemove(color.slug, img)} style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: '20px', textAlign: 'center', padding: 0 }}>×</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => openColorFileInput(color.slug)}
                      style={{ width: 90, height: 90, borderRadius: 8, border: '2px dashed rgba(212,132,138,.4)', background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--gray-warm)', fontSize: 11, fontFamily: 'inherit' }}
                    >
                      <span style={{ fontSize: 22 }}>+</span>
                      Foto
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <input ref={colorFileInputRef} type="file" accept="image/*" multiple hidden onChange={handleColorFileSelect} />
        </Section>
      )}

      {/* ── PERSONALIZACIONES ────────────────────────────── */}
      <Section title="Personalizaciones">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {[
            { key: 'has_huella' as const, label: 'Huella', costKey: 'huella_extra_cost' as const },
            { key: 'has_corazon' as const, label: 'Corazón', costKey: 'corazon_extra_cost' as const },
            { key: 'has_audio' as const, label: 'Audio', costKey: 'audio_extra_cost' as const },
          ].map(({ key, label, costKey }) => (
            <div key={key} style={{ padding: 14, background: form[key] ? 'rgba(212,132,138,.06)' : 'var(--cream-warm)', borderRadius: 10, border: `1.5px solid ${form[key] ? 'rgba(212,132,138,.3)' : 'rgba(27,42,74,.06)'}` }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--navy)', fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(form[key])} onChange={fBool(key)} />{label}
              </label>
              {form[key] && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ ...L, marginTop: 0 }}>Costo extra (COP)</label>
                  <input type="number" min={0} value={form[costKey]} onChange={f(costKey)} style={I} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── ESPECIFICACIONES ─────────────────────────────── */}
      <Section
        title="Especificaciones técnicas"
        action={<DownloadBtn onClick={() => downloadJson(SPECIFICATIONS_TEMPLATE, 'plantilla-especificaciones.json')} />}
      >
        <p style={HintStyle}>
          Objeto JSON con pares clave-valor. Pide a la IA que genere esto basado en la plantilla descargable.
        </p>
        <textarea
          value={specificationsJson}
          onChange={(e) => handleJsonChange('specifications', e.target.value, 'object')}
          style={{ ...I, fontFamily: 'monospace', fontSize: 12, height: 160, resize: 'vertical' }}
          placeholder={'{\n  "Material": "Felpa premium suave",\n  "Relleno": "Fibra sintética"\n}'}
          spellCheck={false}
        />
        {jsonErrors.specifications && <p style={ErrStyle}>{jsonErrors.specifications}</p>}
      </Section>

      {/* ── INSTRUCCIONES DE CUIDADO ─────────────────────── */}
      <Section
        title="Instrucciones de cuidado"
        action={<DownloadBtn onClick={() => downloadJson(DEFAULT_CARE, 'plantilla-cuidados.json')} />}
      >
        <p style={HintStyle}>
          Array JSON de instrucciones. Ya tiene contenido por defecto para peluches — edita según necesites.
        </p>
        <textarea
          value={careJson}
          onChange={(e) => handleJsonChange('care', e.target.value, 'array')}
          style={{ ...I, fontFamily: 'monospace', fontSize: 12, height: 180, resize: 'vertical' }}
          placeholder={'[\n  "Instrucción 1",\n  "Instrucción 2"\n]'}
          spellCheck={false}
        />
        {jsonErrors.care && <p style={ErrStyle}>{jsonErrors.care}</p>}
      </Section>

      {error && <p style={{ color: '#c23b3b', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: '#FFEBEE', borderRadius: 8 }}>{error}</p>}

      {hasPendingWork && (
        <p style={{ color: '#B8696F', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>
          ⚠ Hay imágenes subiendo o sin subir. Reinténtalas o quítalas para poder guardar.
        </p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="submit" disabled={saving || hasPendingWork} style={{ padding: '12px 28px', background: 'var(--coral)', color: '#fff', border: 'none', borderRadius: 10, cursor: (saving || hasPendingWork) ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: (saving || hasPendingWork) ? .6 : 1 }}>
          {saving ? 'Guardando...' : (existing ? 'Guardar cambios' : 'Crear peluche')}
        </button>
        <button type="button" onClick={handleCancel} style={{ padding: '12px 20px', background: 'var(--cream-warm)', color: 'var(--navy)', border: '1px solid rgba(27,42,74,.1)', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
          Cancelar
        </button>
      </div>

      {/* ── MODAL: NUEVO COLOR ───────────────────────────── */}
      {colorModal && (
        <div style={Overlay} onClick={() => setColorModal(false)}>
          <div style={Modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={ModalTitle}>Nuevo color</h3>
            <label style={L}>Nombre del color</label>
            <input value={newColor.name} onChange={(e) => setNewColor((p) => ({ ...p, name: e.target.value }))} style={I} placeholder="Ej: Rosa pálido" autoFocus />
            <label style={{ ...L, marginTop: 14 }}>Color (selector)</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
              <input type="color" value={newColor.hex_code} onChange={(e) => setNewColor((p) => ({ ...p, hex_code: e.target.value }))} style={{ width: 48, height: 40, borderRadius: 8, border: '1.5px solid rgba(27,42,74,.12)', cursor: 'pointer', padding: 2 }} />
              <input value={newColor.hex_code} onChange={(e) => setNewColor((p) => ({ ...p, hex_code: e.target.value }))} style={{ ...I, width: 130 }} placeholder="#D4848A" />
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: newColor.hex_code, border: '1px solid rgba(0,0,0,.1)', flexShrink: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleAddColor} disabled={savingColor} style={{ padding: '9px 20px', background: 'var(--coral)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: 13 }}>{savingColor ? 'Guardando...' : 'Añadir color'}</button>
              <button onClick={() => setColorModal(false)} style={BtnOutline}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVA TALLA ───────────────────────────── */}
      {sizeModal && (
        <div style={Overlay} onClick={() => setSizeModal(false)}>
          <div style={Modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={ModalTitle}>Nueva talla</h3>
            <label style={L}>Etiqueta (ej: XS, S, M, L)</label>
            <input value={newSize.label} onChange={(e) => setNewSize((p) => ({ ...p, label: e.target.value }))} style={I} placeholder="M" autoFocus />
            <label style={{ ...L, marginTop: 14 }}>Medida en cm</label>
            <input value={newSize.cm} onChange={(e) => setNewSize((p) => ({ ...p, cm: e.target.value }))} style={I} placeholder="30 cm" />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleAddSize} disabled={savingSize} style={{ padding: '9px 20px', background: 'var(--coral)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: 13 }}>{savingSize ? 'Guardando...' : 'Añadir talla'}</button>
              <button onClick={() => setSizeModal(false)} style={BtnOutline}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function DownloadBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--cream-peach)', color: 'var(--navy)', border: '1px solid rgba(27,42,74,.1)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Descargar plantilla JSON
    </button>
  )
}

const L: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const I: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid rgba(27,42,74,.12)', fontSize: 13, fontFamily: 'inherit', color: 'var(--navy)', background: 'var(--cream-warm)', boxSizing: 'border-box' }
const CL: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--navy)', cursor: 'pointer' }
const BtnOutline: React.CSSProperties = { padding: '8px 16px', background: '#fff', color: 'var(--navy)', border: '1.5px solid rgba(27,42,74,.12)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }
const Overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const Modal: React.CSSProperties = { background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }
const ModalTitle: React.CSSProperties = { fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--navy)', marginBottom: 16 }
const HintStyle: React.CSSProperties = { fontSize: 12, color: 'var(--gray-warm)', marginBottom: 12, lineHeight: 1.5 }
const ErrStyle: React.CSSProperties = { color: '#c23b3b', fontSize: 12, marginTop: 6, padding: '6px 10px', background: '#FFEBEE', borderRadius: 6 }
