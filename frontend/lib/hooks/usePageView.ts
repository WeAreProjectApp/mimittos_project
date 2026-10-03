'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { analyticsService } from '@/lib/services/analyticsService'
import { consumeOrderAccessFragment } from '@/lib/utils/orderAccess'

function getOrCreateSessionId(): string {
  const key = 'mmts_sid'
  let sid = localStorage.getItem(key)
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(key, sid)
  }
  return sid
}

function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent
  if (/Mobi|Android|iPhone|iPod/.test(ua)) return 'mobile'
  if (/iPad|Tablet/.test(ua)) return 'tablet'
  return 'desktop'
}

function detectTrafficSource(): 'instagram' | 'google' | 'whatsapp' | 'direct' | 'other' {
  const ref = document.referrer.toLowerCase()
  if (!ref) return 'direct'
  if (ref.includes('instagram')) return 'instagram'
  if (ref.includes('google')) return 'google'
  if (ref.includes('whatsapp') || ref.includes('wa.me')) return 'whatsapp'
  return 'other'
}

function isNewVisitor(): boolean {
  const key = 'mmts_visited'
  if (localStorage.getItem(key)) return false
  localStorage.setItem(key, '1')
  return true
}

export function usePageView(peluchSlug?: string) {
  const pathname = usePathname()

  useEffect(() => {
    consumeOrderAccessFragment()
    // Don't track admin or auth pages
    if (pathname.startsWith('/backoffice') || pathname.startsWith('/sign-')) return

    try {
      const session_id = getOrCreateSessionId()
      analyticsService.recordPageView({
        url_path: pathname,
        session_id,
        peluch_slug: peluchSlug,
        is_new_visitor: isNewVisitor(),
        device_type: detectDevice(),
        traffic_source: detectTrafficSource(),
      })
    } catch {
      // Restricted storage must not prevent access to the order itself.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
}
