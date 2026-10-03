'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { CartItem, PaymentMode } from '@/lib/types'

function cartKey(item: CartItem) {
  return `${item.peluch_id}-${item.size_id}-${item.color_id}`
}

function roundTo100(value: number) {
  return Math.round(value / 100) * 100
}

export function lineTotal(item: CartItem) {
  return ((item.unit_price ?? 0) + (item.personalization_cost ?? 0)) * (item.quantity ?? 1)
}

export function calcDeposit(items: CartItem[]) {
  const raw = items.reduce(
    (acc, item) => acc + lineTotal(item) * (item.deposit_percentage ?? 50) / 100,
    0
  )
  return roundTo100(raw)
}

export function calcFullPaymentDiscount(items: CartItem[]) {
  const raw = items.reduce(
    (acc, item) => acc + lineTotal(item) * (item.full_payment_discount_pct ?? 0) / 100,
    0
  )
  return roundTo100(raw)
}

export function calcShipping(items: CartItem[]) {
  const raw = items.reduce(
    (acc, item) => acc + (item.free_shipping ? 0 : (item.shipping_cost ?? 0) * item.quantity),
    0
  )
  return roundTo100(raw)
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
  items: CartItem[]
  addToCart: (item: CartItem) => void
  updatePersonalization: (item: CartItem) => void
  removeFromCart: (peluch_id: number, size_id: number, color_id: number) => void
  clearCart: () => void
  updateQuantity: (peluch_id: number, size_id: number, color_id: number, quantity: number) => void
  subtotal: () => number
  deposit: () => number
  fullPaymentDiscount: () => number
  shipping: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addToCart: (item) => {
        set((state) => {
          const key = cartKey(item)
          const existing = state.items.find((i) => cartKey(i) === key)
          if (existing) {
            return {
              items: state.items.map((i) =>
                cartKey(i) === key ? { ...i, quantity: i.quantity + item.quantity } : i
              ),
            }
          }
          return { items: [...state.items, item] }
        })
      },

      updatePersonalization: (item) => {
        set((state) => ({
          items: state.items.map((existing) => cartKey(existing) === cartKey(item) ? {
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
      },

      removeFromCart: (peluch_id, size_id, color_id) => {
        const key = `${peluch_id}-${size_id}-${color_id}`
        set((state) => ({ items: state.items.filter((i) => cartKey(i) !== key) }))
      },

      clearCart: () => set({ items: [] }),

      updateQuantity: (peluch_id, size_id, color_id, quantity) => {
        const key = `${peluch_id}-${size_id}-${color_id}`
        set((state) => ({
          items: state.items
            .map((i) => (cartKey(i) === key ? { ...i, quantity } : i))
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
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.items = state.items.filter(
          (item) =>
            typeof item.peluch_id === 'number' && item.peluch_id > 0 &&
            typeof item.size_id === 'number' && item.size_id > 0 &&
            typeof item.color_id === 'number' && item.color_id > 0
        )
      },
    }
  )
)
