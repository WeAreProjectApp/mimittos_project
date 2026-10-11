import { randomUUID } from 'node:crypto'
import { createStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'
import type { CartItem } from '../../types'
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import {
  useCartStore, lineTotal, calcDeposit, calcFullPaymentDiscount, calcShipping,
  calcAmountToPayNow, calcBalanceAtDelivery,
} from '../cartStore'
import { mockCartItems } from '../../__tests__/fixtures'

Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true })
afterEach(() => { jest.restoreAllMocks(); localStorage.clear() })

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

  it('rounds the aggregate deposit after adding two lines', () => {
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
        result.current.removeFromCart(result.current.items[0].cart_line_id)
      })
      expect(result.current.items).toHaveLength(0)
    })

    it('should only remove the specified item and keep others', () => {
      const { result } = renderHook(() => useCartStore())
      act(() => {
        result.current.addToCart({ ...item1, quantity: 1 })
        result.current.addToCart({ ...item2, quantity: 1 })
        result.current.removeFromCart(result.current.items[0].cart_line_id)
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
        result.current.updateQuantity(result.current.items[0].cart_line_id, 5)
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
        result.current.updateQuantity(result.current.items[0].cart_line_id, 0)
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
        result.current.updatePersonalization(result.current.items[0].cart_line_id, {
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


const configurationDifferences: Array<[keyof CartItem, unknown]> = [
  ['peluch_id', 99], ['size_id', 99], ['color_id', 99],
  ['has_huella', true], ['huella_type', 'name'], ['huella_text', 'Luna'],
  ['huella_media_id', 44], ['huella_media_token', 'new-huella'],
  ['has_corazon', true], ['corazon_phrase', 'Para siempre'],
  ['has_audio', true], ['audio_media_id', 45], ['audio_media_token', 'new-audio'],
  ['unit_price', 90000], ['personalization_cost', 5000], ['deposit_percentage', 30],
  ['full_payment_discount_pct', 10], ['free_shipping', true], ['shipping_cost', 5000],
]

function addSiblingLines() {
  useCartStore.getState().addToCart({ ...item1, quantity: 1, has_huella: true, huella_type: 'name', huella_text: 'Luna' })
  useCartStore.getState().addToCart({ ...item1, quantity: 1, has_huella: true, huella_type: 'name', huella_text: 'Sol' })
  return useCartStore.getState().items
}

describe('cart line identity', () => {
  beforeEach(() => { useCartStore.getState().clearCart(); localStorage.clear() })

  it.each(configurationDifferences)('preserves a different %s in a separate line', (field, value) => {
    // Catches any fulfillment or quote field being silently dropped by SKU-only merging.
    useCartStore.getState().addToCart({ ...item1, quantity: 1 })
    useCartStore.getState().addToCart({ ...item1, quantity: 1, [field]: value })

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ ...item1, quantity: 1 }),
      expect.objectContaining({ ...item1, quantity: 1, [field]: value }),
    ])
    expect(useCartStore.getState().items[0].cart_line_id).not.toBe(useCartStore.getState().items[1].cart_line_id)
  })

  it('keeps the original identity when identical configurations merge', () => {
    // Catches a repeated addition invalidating its existing recovery URL.
    useCartStore.getState().addToCart({ ...item1, quantity: 1 })
    const original = useCartStore.getState().items[0]
    useCartStore.getState().addToCart({ ...item1, quantity: 2, title: 'Updated presentation' })

    expect(useCartStore.getState().items).toEqual([{ ...original, quantity: 3 }])
  })

  it('ignores an incoming identity when creating a line', () => {
    // Catches caller-provided duplicate identities targeting a sibling during later editing.
    useCartStore.getState().addToCart({ ...item1, cart_line_id: 'untrusted-id' })

    expect(useCartStore.getState().items[0].cart_line_id).toMatch(/^cl_[0-9a-f-]{36}$/)
    expect(useCartStore.getState().items[0].cart_line_id).not.toBe('untrusted-id')
  })

  it('changes only the selected sibling quantity', () => {
    // Catches the triple SKU changing every personalized sibling.
    const [luna, sol] = addSiblingLines()
    useCartStore.getState().updateQuantity(sol.cart_line_id, 3)

    expect(useCartStore.getState().items).toEqual([luna, { ...sol, quantity: 3 }])
  })

  it('removes only the selected sibling', () => {
    // Catches removing Luna also removing Sol of the same SKU.
    const [luna, sol] = addSiblingLines()
    useCartStore.getState().removeFromCart(luna.cart_line_id)

    expect(useCartStore.getState().items).toEqual([sol])
  })

  it('edits one sibling without merging its now identical configuration', () => {
    // Catches recovery altering SKU, quantity, quote or merging the unaffected sibling.
    const [luna, sol] = addSiblingLines()
    const saved = useCartStore.getState().updatePersonalization(sol.cart_line_id, {
      ...luna, peluch_id: 99, size_id: 99, color_id: 99, quantity: 8, unit_price: 1,
      deposit_percentage: 1, shipping_cost: 999,
    })

    expect(saved).toBe(true)
    expect(useCartStore.getState().items).toEqual([luna, { ...sol, huella_text: 'Luna' }])
  })

  it('rejects editing an absent identity', () => {
    // Catches a successful UI redirect after no cart line was updated.
    const siblings = addSiblingLines()
    expect(useCartStore.getState().updatePersonalization('missing', item1)).toBe(false)
    expect(useCartStore.getState().items).toEqual(siblings)
  })

  it('preserves exact text differences', () => {
    // Catches normalization erasing the buyer's intended capitalization or spaces.
    useCartStore.getState().addToCart({ ...item1, huella_text: 'Luna' })
    useCartStore.getState().addToCart({ ...item1, huella_text: ' luna ' })

    expect(useCartStore.getState().items.map(line => line.huella_text)).toEqual(['Luna', ' luna '])
  })

  it('merges absent optional capabilities with null capabilities', () => {
    // Catches legacy capability omissions making otherwise identical lines diverge.
    useCartStore.getState().addToCart({ ...item1, quantity: 1 })
    const original = useCartStore.getState().items[0]
    useCartStore.getState().addToCart({ ...item1, quantity: 1, huella_media_token: null, audio_media_token: null })

    expect(useCartStore.getState().items).toEqual([{ ...original, quantity: 2 }])
  })
})

describe('version zero cart hydration', () => {
  beforeEach(() => { useCartStore.getState().clearCart(); localStorage.clear() })

  it('immediately persists identities for legacy lines once', async () => {
    // Catches IDs living only in memory and changing on the next page load.
    const raw = [{ ...item1, huella_media_token: 'keep-image', audio_media_token: 'keep-audio' }, item2]
    localStorage.setItem('cart', JSON.stringify({ state: { items: raw }, version: 0 }))
    const writes = jest.spyOn(Storage.prototype, 'setItem')
    await useCartStore.persist.rehydrate()

    const lines = useCartStore.getState().items
    expect(lines).toEqual([expect.objectContaining(raw[0]), expect.objectContaining(raw[1])])
    expect(lines[0].cart_line_id).toMatch(/^cl_[0-9a-f-]{36}$/)
    expect(lines[1].cart_line_id).not.toBe(lines[0].cart_line_id)
    expect(writes).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('cart')!)).toEqual({ state: { items: lines }, version: 0 })
  })

  it('keeps persisted identities unchanged over two rehydrations', async () => {
    // Catches normalization regenerating IDs or writing on every hydration.
    localStorage.setItem('cart', JSON.stringify({ state: { items: [item1, item2] }, version: 0 }))
    await useCartStore.persist.rehydrate()
    const lines = useCartStore.getState().items
    const writes = jest.spyOn(Storage.prototype, 'setItem')
    await useCartStore.persist.rehydrate()
    await useCartStore.persist.rehydrate()

    expect(useCartStore.getState().items).toEqual(lines)
    expect(writes).toHaveBeenCalledTimes(0)
    expect(JSON.parse(localStorage.getItem('cart')!)).toEqual({ state: { items: lines }, version: 0 })
  })

  it('repairs a duplicate identity without changing sibling contents', async () => {
    // Catches two lines sharing an ID and being edited or removed together.
    const id = 'cl_00000000-0000-4000-8000-000000000001'
    localStorage.setItem('cart', JSON.stringify({ state: { items: [
      { ...item1, cart_line_id: id }, { ...item2, cart_line_id: id },
    ] }, version: 0 }))
    await useCartStore.persist.rehydrate()

    expect(useCartStore.getState().items[0]).toEqual({ ...item1, cart_line_id: id })
    expect(useCartStore.getState().items[1]).toEqual(expect.objectContaining(item2))
    expect(useCartStore.getState().items[1].cart_line_id).not.toBe(id)
  })

  it('filters retired catalog IDs while preserving valid identities', async () => {
    // Catches normalization resurrecting invalid legacy cart entries.
    const id = 'cl_00000000-0000-4000-8000-000000000001'
    localStorage.setItem('cart', JSON.stringify({ state: { items: [
      { ...item1, cart_line_id: id }, { ...item2, color_id: 0 },
    ] }, version: 0 }))
    await useCartStore.persist.rehydrate()

    expect(useCartStore.getState().items).toEqual([{ ...item1, cart_line_id: id }])
  })

  it('keeps the normalized cart readable by version zero code without migration', async () => {
    // Catches a rollback rejecting a newly versioned cart and displaying it as empty.
    localStorage.setItem('cart', JSON.stringify({ state: { items: [item1] }, version: 0 }))
    await useCartStore.persist.rehydrate()
    const lines = useCartStore.getState().items
    const oldStore = createStore<{ items: CartItem[] }>()(persist(() => ({ items: [] }), { name: 'cart' }))

    expect(oldStore.getState().items).toEqual(lines)
    oldStore.setState({ items: [...lines, item2] })
    await useCartStore.persist.rehydrate()
    expect(useCartStore.getState().items[0]).toEqual(lines[0])
    expect(useCartStore.getState().items[1]).toEqual(expect.objectContaining(item2))
    expect(useCartStore.getState().items[1].cart_line_id).toMatch(/^cl_[0-9a-f-]{36}$/)
  })
})
