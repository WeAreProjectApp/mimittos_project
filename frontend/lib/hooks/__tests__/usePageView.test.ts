import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}))

jest.mock('@/lib/services/analyticsService', () => ({
  analyticsService: { recordPageView: jest.fn() },
}))

import { usePathname } from 'next/navigation'
import { analyticsService } from '@/lib/services/analyticsService'
import { usePageView } from '../usePageView'

const mockUsePathname = usePathname as unknown as jest.Mock
const mockRecordPageView = analyticsService.recordPageView as jest.Mock

describe('usePageView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('records page view with url_path and session_id on a public route', async () => {
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          url_path: '/catalog',
          session_id: expect.any(String),
        })
      )
    })
  })

  it('removes an order access fragment before recording the page view', async () => {
    // Fails if a bearer capability reaches analytics through a copied URL.
    window.history.replaceState({}, '', '/payment?order=ORD-ANALYTICS#access=secret-token')
    const replaceState = jest.spyOn(window.history, 'replaceState')
    mockUsePathname.mockReturnValue('/payment')

    renderHook(() => usePageView())

    await waitFor(() => expect(mockRecordPageView).toHaveBeenCalledWith(expect.objectContaining({ url_path: '/payment' })))
    expect(window.location.href).toBe('http://localhost/payment?order=ORD-ANALYTICS')
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(mockRecordPageView.mock.invocationCallOrder[0])
  })

  it('skips recording on /backoffice routes', () => {
    // quality: allow-mock-only (analytics suppression is observable only at the service boundary)
    // quality: allow-negation-only (the required outcome is the absence of a page-view call)
    mockUsePathname.mockReturnValue('/backoffice/pedidos')
    renderHook(() => usePageView())
    expect(mockRecordPageView).not.toHaveBeenCalled()
  })

  it('skips recording on /sign- routes', () => {
    // quality: allow-mock-only (analytics suppression is observable only at the service boundary)
    // quality: allow-negation-only (the required outcome is the absence of a page-view call)
    mockUsePathname.mockReturnValue('/sign-in')
    renderHook(() => usePageView())
    expect(mockRecordPageView).not.toHaveBeenCalled()
  })

  it('saves a new session id to localStorage when none exists', async () => {
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalled()
    })
    // A base-36 session id was generated and persisted...
    const sid = localStorage.getItem('mmts_sid')
    expect(sid).toMatch(/^[a-z0-9]+$/)
    // ...and the recorded page view carried that exact session id.
    expect(mockRecordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: sid })
    )
  })

  it('reuses an existing session id from localStorage', async () => {
    localStorage.setItem('mmts_sid', 'existing-sess-abc')
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: 'existing-sess-abc' })
      )
    })
  })

  it('marks first-time visitor as new when mmts_visited is not set', async () => {
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ is_new_visitor: true })
      )
    })
  })

  it('detects mobile device from iPhone userAgent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ device_type: 'mobile' })
      )
    })
  })

  it('detects tablet device from iPad userAgent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ device_type: 'tablet' })
      )
    })
  })

  it('detects desktop device from non-mobile userAgent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ device_type: 'desktop' })
      )
    })
  })

  it('detects instagram traffic source from referrer', async () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.instagram.com/',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ traffic_source: 'instagram' })
      )
    })
  })

  it('detects google traffic source from referrer', async () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.google.com/search?q=peluches',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ traffic_source: 'google' })
      )
    })
  })

  it('detects direct traffic when referrer is empty', async () => {
    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ traffic_source: 'direct' })
      )
    })
  })

  it('detects other traffic source for unknown referrer', async () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.facebook.com/',
      configurable: true,
    })
    mockUsePathname.mockReturnValue('/catalog')
    renderHook(() => usePageView())
    await waitFor(() => {
      expect(mockRecordPageView).toHaveBeenCalledWith(
        expect.objectContaining({ traffic_source: 'other' })
      )
    })
  })
})
