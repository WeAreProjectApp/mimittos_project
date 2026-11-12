'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/services/http'

export const BANNER_HEIGHT = 40

interface BannerData {
  is_active: boolean
  message: string
  bg_color?: string
  text_color?: string
}

interface Props {
  onLoad: (active: boolean) => void
}

export default function PromoBanner({ onLoad }: Props) {
  const [data, setData] = useState<BannerData | null>(null)

  useEffect(() => {
    api.get('/content/promo_banner/')
      .then((r) => {
        const d = r.data?.content_json as BannerData
        if (d?.is_active && d?.message) {
          setData(d)
          onLoad(true)
        } else {
          onLoad(false)
        }
      })
      .catch(() => onLoad(false))
  }, [])

  if (!data?.is_active || !data?.message) return null

  const separator = '  ✦  '
  const repeated = Array(6).fill(data.message + separator).join('')

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', top: 'var(--hosting-banner-height, 0px)', left: 0, right: 0, zIndex: 51,
        height: BANNER_HEIGHT,
        background: data.bg_color || 'var(--coral)',
        color: data.text_color || '#fff',
        display: 'flex', alignItems: 'center',
        overflow: 'hidden',
        fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
        fontSize: 13, letterSpacing: '.03em',
      }}
    >
      <span className="promo-ticker-track" aria-hidden>
        {repeated}{repeated}
      </span>
      <span className="sr-only">{data.message}</span>
    </div>
  )
}
