import { mockCartItems } from '../../../lib/__tests__/fixtures'
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { render, screen, within, fireEvent } from '@testing-library/react'

jest.mock('@/lib/stores/cartStore', () => ({
  useCartStore: jest.fn(),
  describeCartPersonalization: jest.requireActual('@/lib/stores/cartStore').describeCartPersonalization,
  calcDeposit: jest.fn(() => 0),
  calcShipping: jest.fn(() => 0),
  calcFullPaymentDiscount: jest.fn(() => 0),
  lineTotal: jest.fn((item: { unit_price: number; quantity: number }) => item.unit_price * item.quantity),
}))

import { useCartStore } from '@/lib/stores/cartStore'
import CartPage from '../page'

const mockUseCartStore = useCartStore as unknown as jest.Mock

afterEach(() => {
  jest.requireActual('@/lib/stores/cartStore').useCartStore.getState().clearCart()
  localStorage.clear()
  jest.clearAllMocks()
})

describe('CartPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders empty cart state with catalog link when cart is empty', () => {
    mockUseCartStore.mockImplementation((selector: (s: { items: [] }) => unknown) =>
      selector({ items: [] })
    )
    render(<CartPage />)
    expect(screen.getByRole('link', { name: /Ver catálogo/i })).toBeInTheDocument()
  })

  it('renders checkout link when cart has items', () => {
    mockUseCartStore.mockImplementation(
      (selector: (s: { items: { cart_line_id: string; peluch_id: number; title: string; quantity: number; unit_price: number; size_label: string; color_name: string; color_hex: string; gallery_urls: string[]; has_huella: boolean; has_corazon: boolean; has_audio: boolean; personalization_cost: number }[]; removeFromCart: jest.Mock; updateQuantity: jest.Mock }) => unknown) =>
        selector({
          items: [{
            cart_line_id: 'cl_00000000-0000-4000-8000-000000000001', peluch_id: 1, title: 'Osito Coral', quantity: 1,
            unit_price: 85000, size_label: 'S', color_name: 'Rosa', color_hex: '#FF69B4',
            gallery_urls: [], has_huella: false, has_corazon: false, has_audio: false, personalization_cost: 0,
          }],
          removeFromCart: jest.fn(),
          updateQuantity: jest.fn(),
        })
    )
    render(<CartPage />)
    expect(screen.getByText('Osito Coral')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Continuar al checkout/i })).toBeInTheDocument()
  })
})


it('changes only Sol through its visible quantity control', async () => {
  // Catches one SKU control changing both named siblings.
  const actualStore = jest.requireActual('@/lib/stores/cartStore').useCartStore
  const luna = { ...mockCartItems[0], cart_line_id: 'cl_00000000-0000-4000-8000-000000000001', quantity: 1, has_huella: true, huella_type: 'name', huella_text: 'Luna' }
  const sol = { ...luna, cart_line_id: 'cl_00000000-0000-4000-8000-000000000002', huella_text: 'Sol' }
  actualStore.setState({ items: [luna, sol] })
  mockUseCartStore.mockImplementation(actualStore)
  render(<CartPage />)

  const line = screen.getByRole('group', { name: 'Osito Coral Nombre: Sol' })
  fireEvent.click(within(line).getByRole('button', { name: '+', exact: true }))

  expect(actualStore.getState().items).toEqual([luna, { ...sol, quantity: 2 }])
  expect(screen.getByRole('group', { name: 'Osito Coral Nombre: Luna' })).toHaveTextContent('Nombre: Luna')
})

it('removes only Luna through its visible delete control', async () => {
  // Catches deleting one customized peluch also deleting its sibling.
  const actualStore = jest.requireActual('@/lib/stores/cartStore').useCartStore
  const luna = { ...mockCartItems[0], cart_line_id: 'cl_00000000-0000-4000-8000-000000000001', quantity: 1, has_huella: true, huella_type: 'name', huella_text: 'Luna' }
  const sol = { ...luna, cart_line_id: 'cl_00000000-0000-4000-8000-000000000002', huella_text: 'Sol' }
  actualStore.setState({ items: [luna, sol] })
  mockUseCartStore.mockImplementation(actualStore)
  render(<CartPage />)

  fireEvent.click(within(screen.getByRole('group', { name: 'Osito Coral Nombre: Luna' })).getByRole('button', { name: /Eliminar/ }))

  expect(actualStore.getState().items).toEqual([sol])
  expect(screen.queryByText('Nombre: Luna')).not.toBeInTheDocument()
  expect(screen.getByText('Nombre: Sol')).toHaveTextContent('Nombre: Sol')
})
