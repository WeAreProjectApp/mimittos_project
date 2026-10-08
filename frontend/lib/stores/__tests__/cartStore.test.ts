import { describe, it, expect, beforeEach } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import {
  useCartStore, lineTotal, calcDeposit, calcFullPaymentDiscount, calcShipping,
  calcAmountToPayNow, calcBalanceAtDelivery,
} from '../cartStore'
import { mockCartItems } from '../../__tests__/fixtures'

const item1 = mockCartItems[0] // peluch_id:1 size_id:2 color_id:1, unit_price:128000, qty:2
const item2 = mockCartItems[1] // peluch_id:2 size_id:1 color_id:2, unit_price:92000, qty:1

describe('payment rounding', () => {
  it.each([[50100, 25000], [50300, 25200]])('matches the deposit charged for %s COP', (price, expected) => {
    expect(calcDeposit([{ ...item1, unit_price: price, personalization_cost: 0, quantity: 1, deposit_percentage: 50 }])).toBe(expected)
  })

  it.each([[50100, 25000], [50300, 25200]])('matches the full payment discount for %s COP', (price, expected) => {
    expect(calcFullPaymentDiscount([{ ...item1, unit_price: price, personalization_cost: 0, quantity: 1, full_payment_discount_pct: 50 }])).toBe(expected)
  })

  it.each([[25050, 25000], [25150, 25200]])('matches the shipping charged for %s COP', (shipping, expected) => {
    expect(calcShipping([{ ...item1, quantity: 1, free_shipping: false, shipping_cost: shipping }])).toBe(expected)
  })

  it('rounds the aggregate deposit after adding all lines', () => {
    const line = { ...item1, unit_price: 50100, personalization_cost: 0, quantity: 1, deposit_percentage: 50 }
    expect(calcDeposit([line, line])).toBe(50100)
  })

  it('shows the corrected delivery balance', () => {
    const line = { ...item1, unit_price: 50100, personalization_cost: 0, quantity: 1, deposit_percentage: 50, free_shipping: true }
    expect(calcBalanceAtDelivery([line], 'deposit')).toBe(25100)
  })

  it('shows the corrected full payment amount', () => {
    const line = { ...item1, unit_price: 50100, personalization_cost: 0, quantity: 1, full_payment_discount_pct: 50, free_shipping: true }
    expect(calcAmountToPayNow([line], 'full')).toBe(25100)
  })
})

describe('cartStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useCartStore())
    act(() => { result.current.clearCart() })
  })

  describe('addToCart', () => {
    it('should add a new item to cart', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => { result.current.addToCart({ ...item1, quantity: 1 }) })
      expect(result.current.items).toHaveLength(1)
    })

    it('should increase quantity when same peluch+size+color added again', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 2 })
        result.current.addToCart({ ...item1, quantity: 3 })
      })
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].quantity).toBe(5)
    })

    it('should add multiple different items', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
        result.current.addToCart({ ...item2, quantity: 1 })
      })
      expect(result.current.items).toHaveLength(2)
    })

    it('should treat same peluch with different size as separate item', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
        result.current.addToCart({ ...item1, size_id: 99, quantity: 1 })
      })
      expect(result.current.items).toHaveLength(2)
    })
  })

  describe('removeFromCart', () => {
    it('should remove the specified item', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
      })
      expect(result.current.items).toHaveLength(1)

      act(() => {
        result.current.removeFromCart(item1.peluch_id, item1.size_id, item1.color_id)
      })
      expect(result.current.items).toHaveLength(0)
    })

    it('should only remove the specified item and keep others', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
        result.current.addToCart({ ...item2, quantity: 1 })
        result.current.removeFromCart(item1.peluch_id, item1.size_id, item1.color_id)
      })
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].peluch_id).toBe(item2.peluch_id)
    })
  })

  describe('updateQuantity', () => {
    it('should update the quantity of an item', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
        result.current.updateQuantity(item1.peluch_id, item1.size_id, item1.color_id, 5)
      })
      expect(result.current.items[0].quantity).toBe(5)
    })

    it('should remove item when quantity is set to 0', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
      })
      expect(result.current.items).toHaveLength(1)

      act(() => {
        result.current.updateQuantity(item1.peluch_id, item1.size_id, item1.color_id, 0)
      })
      expect(result.current.items).toHaveLength(0)
    })
  })

  describe('clearCart', () => {
    it('should remove all items', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
        result.current.addToCart({ ...item2, quantity: 1 })
      })
      expect(result.current.items).toHaveLength(2)

      act(() => {
        result.current.clearCart()
      })
      expect(result.current.items).toHaveLength(0)
    })
  })

  describe('updatePersonalization', () => {
    it('updates personalization in place', () => {
      // Fails if recovery turns two ordered peluches into a different cart line.
      const { result } = renderHook(() => useCartStore())
      const original = { ...item1, quantity: 2, has_huella: true, huella_media_id: 10, huella_media_token: 'old-huella' }
      act(() => {
        result.current.addToCart(original)
        result.current.updatePersonalization({
          ...original,
          personalization_cost: 12000,
          huella_media_id: 44,
          huella_media_token: 'fresh-huella',
          has_audio: true,
          audio_media_id: 45,
          audio_media_token: 'fresh-audio',
        })
      })

      expect(result.current.items).toEqual([expect.objectContaining({
        peluch_id: 1, size_id: 2, color_id: 1, quantity: 2,
        personalization_cost: 12000, huella_media_id: 44, huella_media_token: 'fresh-huella',
        audio_media_id: 45, audio_media_token: 'fresh-audio',
      })])
    })
  })

  describe('subtotal', () => {
    it('should calculate correct subtotal using lineTotal', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 2 }) // 128000 * 2
        result.current.addToCart({ ...item2, quantity: 1 }) // 92000 * 1
      })
      expect(result.current.subtotal()).toBe(128000 * 2 + 92000 * 1)
    })

    it('should return 0 for empty cart', () => {
      const { result } = renderHook(() => useCartStore())
      expect(result.current.subtotal()).toBe(0)
    })
  })
})

describe('lineTotal', () => {
  it('should compute (unit_price + personalization_cost) * quantity', () => {
    const item = { ...item1, unit_price: 100000, personalization_cost: 20000, quantity: 3 }
    expect(lineTotal(item)).toBe(360000)
  })
})

describe('calcDeposit', () => {
  it('rounds the weighted deposit to the nearest 100 COP', () => {
    const items = [
      { ...item1, deposit_percentage: 50 }, // 128000 * 2 * 0.5 = 128000
      { ...item2, deposit_percentage: 50 }, //  92000 * 1 * 0.5 =  46000
    ]
    expect(calcDeposit(items)).toBe(174000)
  })

  it('uses each item own deposit_percentage (weighted)', () => {
    const items = [
      { ...item1, deposit_percentage: 30 }, // 256000 * 0.3 = 76800
      { ...item2, deposit_percentage: 50 }, //  92000 * 0.5 = 46000
    ]
    expect(calcDeposit(items)).toBe(122800)
  })
})
