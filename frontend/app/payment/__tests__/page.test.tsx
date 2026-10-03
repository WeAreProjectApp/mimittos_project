import { describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  useSearchParams: jest.fn(),
}))

jest.mock('@/lib/services/paymentService', () => ({
  paymentService: {
    getInfo: jest.fn(),
    getAcceptanceTokens: jest.fn(),
    getPseBanks: jest.fn(),
    processCard: jest.fn(),
    processNequi: jest.fn(),
    processPse: jest.fn(),
    processBancolombia: jest.fn(),
    tokenizeCard: jest.fn(),
    pollStatus: jest.fn(),
    checkStatus: jest.fn(),
  },
}))

import { useSearchParams } from 'next/navigation'
import { paymentService } from '@/lib/services/paymentService'
import PaymentPage from '../page'

const mockUseSearchParams = useSearchParams as unknown as jest.Mock
const mockGetInfo = paymentService.getInfo as jest.Mock
const mockGetAcceptanceTokens = paymentService.getAcceptanceTokens as jest.Mock
const mockGetPseBanks = paymentService.getPseBanks as jest.Mock

const mockPaymentInfo = {
  order_number: 'ORD-001',
  reference: 'REF-001',
  amount_in_cents: 12800000,
  currency: 'COP',
  total_amount: 128000,
  deposit_amount: 64000,
  balance_amount: 64000,
  customer_name: 'Ana García',
  customer_email: 'ana@test.com',
  customer_phone: '3001234567',
  status: 'pending',
}

describe('PaymentPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSearchParams.mockReturnValue({ get: (key: string) => key === 'order' ? 'ORD-001' : null })
    mockGetInfo.mockResolvedValue(mockPaymentInfo)
    mockGetAcceptanceTokens.mockResolvedValue({
      acceptance_token: 'tok-acc',
      acceptance_permalink: 'https://wompi.co/terms',
      personal_auth_token: 'tok-personal',
    })
    mockGetPseBanks.mockResolvedValue([])
  })

  it('renders payment method selector after order info loads', async () => {
    render(<Suspense fallback={null}><PaymentPage /></Suspense>)
    await waitFor(() => {
      expect(screen.getByText('ORD-001')).toBeInTheDocument()
    })
  })

  it('renders Wompi security text', () => {
    render(<Suspense fallback={null}><PaymentPage /></Suspense>)
    expect(screen.getByText(/Pago seguro · Wompi/i)).toBeInTheDocument()
  })

  it('offers only NIT as document type for a legal entity in PSE', async () => {
    const user = userEvent.setup()
    render(<Suspense fallback={null}><PaymentPage /></Suspense>)
    await waitFor(() => expect(screen.getByText('ORD-001')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /PSE/i }))
    await user.click(screen.getByRole('button', { name: 'Jurídica' }))

    expect(screen.getByRole('option', { name: 'NIT' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'CC' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'CE' })).not.toBeInTheDocument()
  })

  it('offers CC and CE as document types for a natural person in PSE', async () => {
    const user = userEvent.setup()
    render(<Suspense fallback={null}><PaymentPage /></Suspense>)
    await waitFor(() => expect(screen.getByText('ORD-001')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /PSE/i }))

    expect(screen.getByRole('option', { name: 'CC' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'CE' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'NIT' })).not.toBeInTheDocument()
  })

  it('shows recovery without loading Wompi when order access is rejected', async () => {
    // Fails if a private payment page contacts Wompi before its order access is verified.
    mockGetInfo.mockRejectedValue({ response: { status: 403, data: { code: 'order_access_required' } } })

    render(<Suspense fallback={null}><PaymentPage /></Suspense>)

    expect(await screen.findByTestId('order-access-recovery')).toBeInTheDocument()
    // quality: allow-mock-only (there is no public UI for a Wompi bootstrap request)
    expect(mockGetAcceptanceTokens).not.toHaveBeenCalled()
  })
})
