import { describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

jest.mock('@/lib/services/orderService', () => ({
  orderService: { trackOrder: jest.fn() },
}))

import { useSearchParams } from 'next/navigation'
import { orderService } from '@/lib/services/orderService'
import TrackingPage from '../page'

const mockUseSearchParams = useSearchParams as unknown as jest.Mock

describe('TrackingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSearchParams.mockReturnValue({ get: () => null })
  })

  it('renders the tracking search input', () => {
    render(<Suspense fallback={null}><TrackingPage /></Suspense>)
    expect(screen.getByPlaceholderText(/PELUCH-20260420-XXXX/i)).toBeInTheDocument()
  })

  it('renders the Seguimiento section heading', () => {
    render(<Suspense fallback={null}><TrackingPage /></Suspense>)
    expect(screen.getByText('Seguimiento')).toBeInTheDocument()
  })

  it('shows access recovery after a protected tracking lookup is rejected', async () => {
    // Fails if tracking leaves a guest at a generic failure instead of code recovery.
    mockUseSearchParams.mockReturnValue({ get: (key: string) => key === 'order' ? 'ORD-TRACKING' : null })
    ;(orderService.trackOrder as jest.Mock).mockRejectedValue({ response: { status: 403, data: { code: 'order_access_required' } } })

    render(<Suspense fallback={null}><TrackingPage /></Suspense>)

    expect(await screen.findByTestId('order-access-recovery')).toBeInTheDocument()
  })
})
