'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { CartItem, CartLine, PaymentMode } from '@/lib/types'
import { roundToHundred } from '@/lib/utils/pricing'

const CART_LINE_ID_PATTERN = /^cl_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function configurationKey(item: CartItem) {
  return JSON.stringify([
    item.peluch_id, item.size_id, item.color_id,
    item.has_huella ?? false, item.huella_type ?? '', item.huella_text ?? '',
    item.huella_media_id ?? null, item.huella_media_token ?? null,
    item.has_corazon ?? false, item.corazon_phrase ?? '',
    item.has_audio ?? false, item.audio_media_id ?? null, item.audio_media_token ?? null,
    item.unit_price ?? 0, item.personalization_cost ?? 0, item.deposit_percentage ?? 50,
    item.full_payment_discount_pct ?? 0, item.free_shipping ?? false, item.shipping_cost ?? 0,
  ])
}

function newLineId() {
  return `cl_${crypto.randomUUID()}`
}

export function describeCartPersonalization(item: CartItem): string[] {
  const labels: Record<string, string> = { name: 'Nombre', date: 'Fecha', letter: 'Inicial' }
  const descriptions: string[] = []
  if (item.has_huella) descriptions.push(item.huella_type === 'image'
    ? 'Huella: imagen personalizada'
    : `${labels[item.huella_type] ?? 'Huella'}: ${item.huella_text}`)
  if (item.has_corazon) descriptions.push(`Corazón: ${item.corazon_phrase}`)
  if (item.has_audio) descriptions.push('Audio personalizado')
  return descriptions
}

export function lineTotal(item: CartItem) {
  return ((item.unit_price ?? 0) + (item.personalization_cost ?? 0)) * (item.quantity ?? 1)
}

export function calcDeposit(items: CartItem[]) {
  const raw = items.reduce(
    (acc, item) => acc + lineTotal(item) * (item.deposit_percentage ?? 50) / 100,
    0
  )
  return roundToHundred(raw)
}

export function calcFullPaymentDiscount(items: CartItem[]) {
  const raw = items.reduce(
    (acc, item) => acc + lineTotal(item) * (item.full_payment_discount_pct ?? 0) / 100,
    0
  )
  return roundToHundred(raw)
}

export function calcShipping(items: CartItem[]) {
  const raw = items.reduce(
    (acc, item) => acc + (item.free_shipping ? 0 : (item.shipping_cost ?? 0) * item.quantity),
    0
  )
  return roundToHundred(raw)
}

export function calcAmountToPayNow(items: CartItem[], mode: PaymentMode) {
  const subtotal = items.reduce((acc, item) => acc + lineTotal(item), 0)
  const shipping = calcShipping(items)
  if (mode === 'full') {
    const discount = calcFullPaymentDiscount(items)
    return Math.max(subtotal - discount, 0) + shipping
  }
  return calcDeposit(items)
}

export function calcBalanceAtDelivery(items: CartItem[], mode: PaymentMode) {
  if (mode === 'full') return 0
  const subtotal = items.reduce((acc, item) => acc + lineTotal(item), 0)
  const deposit = calcDeposit(items)
  const shipping = calcShipping(items)
  return subtotal - deposit + shipping
}

type CartState = {
  items: CartLine[]
  normalizeHydratedItems: () => void
  addToCart: (item: CartItem) => void
  updatePersonalization: (cartLineId: string, item: CartItem) => boolean
  removeFromCart: (cartLineId: string) => void
  clearCart: () => void
  updateQuantity: (cartLineId: string, quantity: number) => void
  subtotal: () => number
  deposit: () => number
  fullPaymentDiscount: () => number
  shipping: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      normalizeHydratedItems: () => {
        const original = get().items
        const seen = new Set<string>()
        let changed = false
        const items = original.filter((item) =>
          typeof item.peluch_id === 'number' && item.peluch_id > 0 &&
          typeof item.size_id === 'number' && item.size_id > 0 &&
          typeof item.color_id === 'number' && item.color_id > 0
        ).map((item) => {
          if (item.cart_line_id && CART_LINE_ID_PATTERN.test(item.cart_line_id) && !seen.has(item.cart_line_id)) {
            seen.add(item.cart_line_id)
            return item
          }
          changed = true
          const cart_line_id = newLineId()
          seen.add(cart_line_id)
          return { ...item, cart_line_id }
        })
        if (changed || items.length !== original.length) set({ items })
      },

      addToCart: (item) => {
        set((state) => {
          const key = configurationKey(item)
          const existing = state.items.find((i) => configurationKey(i) === key)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.cart_line_id === existing.cart_line_id ? { ...i, quantity: i.quantity + item.quantity } : i
              ),
            }
          }
          return { items: [...state.items, { ...item, cart_line_id: newLineId() }] }
        })
      },

      updatePersonalization: (cartLineId, item) => {
        if (!get().items.some((line) => line.cart_line_id === cartLineId)) return false
        set((state) => ({
          items: state.items.map((existing) => existing.cart_line_id === cartLineId ? {
            ...existing,
            personalization_cost: item.personalization_cost,
            has_huella: item.has_huella,
            huella_type: item.huella_type,
            huella_text: item.huella_text,
            huella_media_id: item.huella_media_id,
            huella_media_token: item.huella_media_token,
            has_corazon: item.has_corazon,
            corazon_phrase: item.corazon_phrase,
            has_audio: item.has_audio,
            audio_media_id: item.audio_media_id,
            audio_media_token: item.audio_media_token,
          } : existing),
        }))
        return true
      },

      removeFromCart: (cartLineId) => {
        set((state) => ({ items: state.items.filter((i) => i.cart_line_id !== cartLineId) }))
      },

      clearCart: () => set({ items: [] }),

      updateQuantity: (cartLineId, quantity) => {
        set((state) => ({
          items: state.items
            .map((i) => (i.cart_line_id === cartLineId ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0),
        }))
      },

      subtotal: () => get().items.reduce((acc, item) => acc + lineTotal(item), 0),
      deposit: () => calcDeposit(get().items),
      fullPaymentDiscount: () => calcFullPaymentDiscount(get().items),
      shipping: () => calcShipping(get().items),
    }),
    {
      name: 'cart',
      partialize: (state) => ({ items: state.items }),
      version: 0,
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) state.normalizeHydratedItems()
      },
    }
  )
)
