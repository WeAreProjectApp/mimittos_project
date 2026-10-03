import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Suspense, type ComponentType } from 'react'

jest.mock('next/navigation', () => ({ __esModule: true, useSearchParams: jest.fn() }))
import { paymentService, type PaymentInfo } from '@/lib/services/paymentService'
import { useCartStore } from '@/lib/stores/cartStore'

let OrderConfirmedPage: ComponentType

const mockGetInfo = jest.spyOn(paymentService, 'getInfo')
const mockCheckStatus = jest.spyOn(paymentService, 'checkStatus')
const mockedNavigation = jest.requireMock('next/navigation') as { useSearchParams: jest.Mock }
const originalClearCart = useCartStore.getState().clearCart
const paymentInfo: PaymentInfo = {
  order_number: 'ORD-001', reference: 'REF-001', amount_in_cents: 12800000, currency: 'COP',
  total_amount: 128000, deposit_amount: 64000, balance_amount: 64000, shipping_amount: 0,
  discount_amount: 0, payment_mode: 'deposit', amount_paid_now: 64000, customer_name: 'Ana García',
  customer_email: 'buyer@example.com', customer_phone: '3001234567', status: 'pending',
}

describe('OrderConfirmedPage', () => {
  beforeAll(async () => {
    OrderConfirmedPage = (await import('../page')).default
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockedNavigation.useSearchParams.mockReturnValue({ get: (key: string) => ({ order: 'ORD-001', confirmed: '1', guest: '0' }[key] ?? null) })
    useCartStore.setState({ items: [], clearCart: originalClearCart })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('retains the cart for an authorized pending order', async () => {
    // Fails if a crafted confirmed query clears products before the protected status says approved.
    const clearCart = jest.fn()
    useCartStore.setState({ clearCart })
    mockGetInfo.mockResolvedValue(paymentInfo)
    mockCheckStatus.mockResolvedValue({
      status: 'pending', order_status: 'pending_payment', synced: false, wompi_status_message: '',
      payment_method_type: '', amount_in_cents: 12800000,
    })

    render(<Suspense fallback={null}><OrderConfirmedPage /></Suspense>)

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalledWith('ORD-001'))
    expect(clearCart).not.toHaveBeenCalled()
    expect(await screen.findByText('Pago en proceso')).toBeInTheDocument()
  })

  it('clears the cart once after protected order info reports approval', async () => {
    // Fails if checkout completion does not clear the purchased cart after authorization.
    const clearCart = jest.fn()
    useCartStore.setState({ clearCart })
    mockGetInfo.mockResolvedValue({ ...paymentInfo, status: 'approved' })

    render(<Suspense fallback={null}><OrderConfirmedPage /></Suspense>)

    await waitFor(() => expect(clearCart).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/Pago confirmado/i)).toBeInTheDocument()
  })

  it('retains the cart after an access-required response', async () => {
    // Fails if a rejected private page hides recovery or discards products before authorization.
    const retainedItem = { peluch_id: 1, size_id: 1, color_id: 1, quantity: 2 }
    useCartStore.setState({ items: [retainedItem] as never[] })
    mockGetInfo.mockRejectedValue({ response: { status: 403, data: { code: 'order_access_required' } } })

    render(<Suspense fallback={null}><OrderConfirmedPage /></Suspense>)

    expect(await screen.findByTestId('order-access-recovery')).toBeInTheDocument()
    jest.useFakeTimers()
    await act(async () => { await jest.advanceTimersByTimeAsync(60_000) })
    // quality: allow-mock-only (the absence of a private polling request is observable only at its service boundary)
    expect(mockCheckStatus).not.toHaveBeenCalled()
    expect(useCartStore.getState().items).toEqual([retainedItem])
  })

  it('stops polling after a protected status returns 403', async () => {
    // Fails if a later access rejection leaves private confirmation polling active.
    const retainedItem = { peluch_id: 1, size_id: 1, color_id: 1, quantity: 2 }
    useCartStore.setState({ items: [retainedItem] as never[] })
    mockGetInfo.mockResolvedValue(paymentInfo)
    mockCheckStatus.mockRejectedValue({ response: { status: 403, data: { code: 'order_access_required' } } })
    jest.useFakeTimers()

    render(<Suspense fallback={null}><OrderConfirmedPage /></Suspense>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await jest.advanceTimersByTimeAsync(1_500) })

    expect(await screen.findByTestId('order-access-recovery')).toBeInTheDocument()
    expect(mockCheckStatus).toHaveBeenCalledWith('ORD-001')
    await act(async () => { await jest.advanceTimersByTimeAsync(60_000) })
    // quality: allow-mock-only (the absence of further private polling is observable only at its service boundary)
    expect(mockCheckStatus).toHaveBeenCalledTimes(1)
    expect(useCartStore.getState().items).toEqual([retainedItem])
  })
})
