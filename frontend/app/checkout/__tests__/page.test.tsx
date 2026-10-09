import { afterEach, describe, it, expect, beforeEach } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import CheckoutPage from '../page'
import { useCartStore } from '../../../lib/stores/cartStore'
import { orderService } from '../../../lib/services/orderService'
import { forgetOrderAccess, getOrderAccessToken } from '../../../lib/utils/orderAccess'
import { useRouter } from 'next/navigation'

jest.mock('../../../lib/stores/cartStore', () => ({
  useCartStore: jest.fn(),
  lineTotal: jest.fn((item: any) => (item.unit_price + item.personalization_cost) * item.quantity),
  calcDeposit: jest.fn(() => 0),
  calcShipping: jest.fn(() => 0),
  calcFullPaymentDiscount: jest.fn(() => 0),
  calcAmountToPayNow: jest.fn(() => 0),
  calcBalanceAtDelivery: jest.fn(() => 0),
}))

jest.mock('../../../lib/services/orderService', () => ({
  orderService: { createOrder: jest.fn() },
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

const mockUseCartStore = useCartStore as unknown as jest.Mock
const mockOrderService = orderService as jest.Mocked<typeof orderService>
const mockUseRouter = useRouter as unknown as jest.Mock
const futureExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const AUDIO_RETRY_MESSAGE = 'Vuelve a subir el audio de este peluche para completar tu pedido.'

const peluchItem = {
  peluch_id: 1, peluch_slug: 'osito-coral', title: 'Osito Coral',
  size_id: 2, size_label: 'Mediano',
  color_id: 1, color_name: 'Rosa Coral', color_hex: '#D4848A',
  unit_price: 128000, personalization_cost: 0, quantity: 1,
  gallery_urls: ['http://example.com/img.jpg'],
  has_huella: false, huella_type: '', huella_text: '', huella_media_id: null,
  has_corazon: false, corazon_phrase: '',
  has_audio: false, audio_media_id: null,
}

const setCartState = (state: any) => {
  mockUseCartStore.mockImplementation((selector: (store: any) => unknown) => selector(state))
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    forgetOrderAccess('PELUCH-001')
    forgetOrderAccess('ORD-GRANT')
  })

  afterEach(() => {
    forgetOrderAccess('PELUCH-001')
    forgetOrderAccess('ORD-GRANT')
  })

  it('renders empty cart message when cart is empty', async () => {
    setCartState({ items: [], clearCart: jest.fn() })
    render(<CheckoutPage />)
    await waitFor(() => {
      expect(screen.getByText(/Tu carrito está vacío/)).toBeInTheDocument()
    })
  })

  it('disables submit button when cart is empty', async () => {
    setCartState({ items: [], clearCart: jest.fn() })
    render(<CheckoutPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ir a pagar/i })).toBeDisabled()
    })
  })

  it('disables submit button when terms not accepted', async () => {
    setCartState({ items: [peluchItem], clearCart: jest.fn() })
    render(<CheckoutPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ir a pagar/i })).toBeDisabled()
    })
  })

  it('shows item title in order summary', async () => {
    setCartState({ items: [peluchItem], clearCart: jest.fn() })
    render(<CheckoutPage />)
    await waitFor(() => {
      expect(screen.getByText('Osito Coral')).toBeInTheDocument()
    })
  })

  it('enables submit button after accepting terms', async () => {
    setCartState({ items: [peluchItem], clearCart: jest.fn() })
    render(<CheckoutPage />)

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ir a pagar/i })).not.toBeDisabled()
    })
  })

  it('calls orderService.createOrder on successful submission', async () => {
    const clearCart = jest.fn()
    setCartState({ items: [peluchItem], clearCart })
    mockOrderService.createOrder.mockResolvedValueOnce({
      order_number: 'PELUCH-001',
      order_access_token: 'initial-order-token',
      expires_at: futureExpiry(),
      deposit_amount: 64000,
      balance_amount: 64000,
      shipping_amount: 0,
      discount_amount: 0,
      payment_mode: 'deposit',
      amount_paid_now: 64000,
      total_amount: 128000,
      is_guest: false,
    })

    jest.spyOn(HTMLFormElement.prototype, 'checkValidity').mockReturnValue(true)
    jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true)

    render(<CheckoutPage />)

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Ir a pagar/i })).not.toBeDisabled())

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Ir a pagar/i }).closest('form')!)
    })

    await waitFor(() => {
      expect(mockOrderService.createOrder).toHaveBeenCalledTimes(1)
    })

    jest.restoreAllMocks()
  })

  it('shows error message when order creation fails', async () => {
    setCartState({ items: [peluchItem], clearCart: jest.fn() })
    mockOrderService.createOrder.mockRejectedValueOnce({
      response: { data: { detail: 'Stock insuficiente' } },
    })

    jest.spyOn(HTMLFormElement.prototype, 'checkValidity').mockReturnValue(true)
    jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true)

    render(<CheckoutPage />)

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Ir a pagar/i })).not.toBeDisabled())

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Ir a pagar/i }).closest('form')!)
    })

    expect(await screen.findByText('Stock insuficiente')).toBeInTheDocument()
    jest.restoreAllMocks()
  })

  it('stores the issued grant before navigating to payment', async () => {
    // Fails if checkout navigates to a private payment page without its new capability.
    const push = jest.fn()
    push.mockImplementation(() => expect(getOrderAccessToken('ORD-GRANT')).toBe('order-token'))
    mockUseRouter.mockReturnValue({ push })
    setCartState({ items: [peluchItem], clearCart: jest.fn() })
    mockOrderService.createOrder.mockResolvedValueOnce({
      order_number: 'ORD-GRANT', order_access_token: 'order-token', expires_at: futureExpiry(),
      deposit_amount: 64000, balance_amount: 64000, shipping_amount: 0, discount_amount: 0,
      payment_mode: 'deposit', amount_paid_now: 64000, total_amount: 128000, is_guest: true,
    })
    jest.spyOn(HTMLFormElement.prototype, 'checkValidity').mockReturnValue(true)
    jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true)

    render(<CheckoutPage />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Ir a pagar/i }).closest('form')!)
    })

    await waitFor(() => expect(push).toHaveBeenCalledWith('/payment?order=ORD-GRANT&amount=64000&guest=1'))
    expect(getOrderAccessToken('ORD-GRANT')).toBe('order-token')
    jest.restoreAllMocks()
  })

  // DRF 3.18 sends {"items": {"1": {...}}} with only the invalid lines; the array shape is the older format.
  const mediaErrorBodies = [
    { shape: 'the indexed object sent by the API', items: { 1: { audio_media_id: [AUDIO_RETRY_MESSAGE] } } },
    { shape: 'a per-line array', items: [{}, { audio_media_token: [AUDIO_RETRY_MESSAGE] }] },
  ]

  it.each(mediaErrorBodies)('attaches media recovery to the failed line from $shape', async ({ items }) => {
    // Fails if an indexed error is attached to the first cart line instead of its failed variant.
    const clearCart = jest.fn()
    const unaffectedItem = { ...peluchItem, quantity: 1 }
    const failedItem = {
      ...peluchItem, peluch_id: 2, peluch_slug: 'conejo-lila', title: 'Conejo Lila',
      size_id: 5, size_label: 'Grande', color_id: 7, color_name: 'Lila', quantity: 2,
    }
    setCartState({ items: [unaffectedItem, failedItem], clearCart })
    mockOrderService.createOrder.mockRejectedValueOnce({ response: { data: { items } } })
    jest.spyOn(HTMLFormElement.prototype, 'checkValidity').mockReturnValue(true)
    jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true)

    render(<CheckoutPage />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /Ir a pagar/i }).closest('form')!)
    })

    expect(await screen.findByText('Actualiza los archivos de los productos indicados para continuar. Tu carrito se conserva.')).toBeInTheDocument()
    const recoveryLink = screen.getByRole('link', { name: 'Volver a personalizar Conejo Lila' })
    expect(recoveryLink).toHaveAttribute('href', '/peluches/conejo-lila?cartItem=2-5-7')
    expect(recoveryLink.parentElement).toHaveTextContent(AUDIO_RETRY_MESSAGE)
    expect(screen.queryByRole('link', { name: 'Volver a personalizar Osito Coral' })).not.toBeInTheDocument()
    expect(mockOrderService.createOrder).toHaveBeenCalledWith(expect.objectContaining({ items: [
      expect.objectContaining({ peluch_id: 1, size_id: 2, color_id: 1, quantity: 1 }),
      expect.objectContaining({ peluch_id: 2, size_id: 5, color_id: 7, quantity: 2 }),
    ] }))
    expect(clearCart).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  const checkoutFieldLabels = [
    'Nombre completo', 'Correo electrónico', 'Celular', 'Departamento',
    'Ciudad', 'Código postal', 'Dirección completa', 'Notas para el pedido (opcional)',
  ]

  it.each(checkoutFieldLabels)('renders the %s field at 16px to prevent iOS focus zoom', async (label) => {
    // Fails if a checkout field drops below 16px, which makes iOS Safari zoom in on focus (FORM-3).
    setCartState({ items: [peluchItem], clearCart: jest.fn() })
    render(<CheckoutPage />)

    expect(await screen.findByLabelText(label)).toHaveStyle({ fontSize: '16px' })
  })
})
