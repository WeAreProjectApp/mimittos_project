import { afterEach, describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import OrderAccessRecovery from '../OrderAccessRecovery'
import { orderAccessService } from '@/lib/services/orderAccessService'
import { forgetOrderAccess, getOrderAccessToken } from '@/lib/utils/orderAccess'

const mockRequestCode = jest.spyOn(orderAccessService, 'requestCode')
const mockVerifyCode = jest.spyOn(orderAccessService, 'verifyCode')
const futureExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

describe('OrderAccessRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    forgetOrderAccess('ORD-VERIFIED')
  })

  afterEach(() => {
    forgetOrderAccess('ORD-VERIFIED')
  })

  it('shows the generic acknowledgement after requesting access', async () => {
    // Fails if the recovery UI reveals whether the supplied email owns the order.
    mockRequestCode.mockResolvedValue({ detail: 'accepted' })
    render(<OrderAccessRecovery orderNumber="ORD-RECOVERY" onAccessGranted={jest.fn()} />)

    fireEvent.change(screen.getByTestId('order-access-email-input'), { target: { value: 'buyer@example.com' } })
    fireEvent.submit(screen.getByTestId('order-access-request-button').closest('form')!)

    expect(await screen.findByText('Si los datos coinciden, recibirás un código en el correo del pedido. Revisa también spam. Para reenviar, espera al menos un minuto.')).toBeInTheDocument()
    expect(mockRequestCode).toHaveBeenCalledWith('ORD-RECOVERY', 'buyer@example.com')
  })

  it('renders the exact verification error for a rejected code', async () => {
    // Fails if a failed verification leaves a buyer without a concrete recovery outcome.
    mockRequestCode.mockResolvedValue({ detail: 'accepted' })
    mockVerifyCode.mockRejectedValue(new Error('bad code'))
    render(<OrderAccessRecovery orderNumber="ORD-RECOVERY-ERROR" onAccessGranted={jest.fn()} />)

    fireEvent.change(screen.getByTestId('order-access-email-input'), { target: { value: 'buyer@example.com' } })
    fireEvent.submit(screen.getByTestId('order-access-request-button').closest('form')!)
    await screen.findByTestId('order-access-code-input')
    fireEvent.change(screen.getByTestId('order-access-code-input'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByTestId('order-access-verify-button').closest('form')!)

    expect(await screen.findByText('No pudimos verificar el código. Revisa los datos o solicita uno nuevo más tarde.')).toBeInTheDocument()
  })

  it('stores the verified grant before refreshing the protected screen', async () => {
    // Fails if a valid code does not make the next private request authorized.
    mockRequestCode.mockResolvedValue({ detail: 'accepted' })
    mockVerifyCode.mockResolvedValue({ order_access_token: 'verified-token', expires_at: futureExpiry() })
    let callbackSawStoredGrant = false
    const onAccessGranted = () => {
      expect(getOrderAccessToken('ORD-VERIFIED')).toBe('verified-token')
      callbackSawStoredGrant = true
    }
    render(<OrderAccessRecovery orderNumber="ORD-VERIFIED" onAccessGranted={onAccessGranted} />)

    fireEvent.change(screen.getByTestId('order-access-email-input'), { target: { value: 'buyer@example.com' } })
    fireEvent.submit(screen.getByTestId('order-access-request-button').closest('form')!)
    await screen.findByTestId('order-access-code-input')
    fireEvent.change(screen.getByTestId('order-access-code-input'), { target: { value: '654321' } })
    fireEvent.submit(screen.getByTestId('order-access-verify-button').closest('form')!)

    await waitFor(() => expect(callbackSawStoredGrant).toBe(true))
    expect(getOrderAccessToken('ORD-VERIFIED')).toBe('verified-token')
    expect(mockVerifyCode).toHaveBeenCalledWith('ORD-VERIFIED', 'buyer@example.com', '654321')
  })
})
