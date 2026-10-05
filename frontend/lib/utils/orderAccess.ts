'use client'

import type { OrderAccessGrant } from '@/lib/types'

type StoredAccess = Pick<OrderAccessGrant, 'order_access_token'> & { expires_at?: string }

const memoryAccess = new Map<string, StoredAccess>()
const storageKey = (orderNumber: string) => `mimittos_order_access:${orderNumber}`

export function storeOrderAccess(orderNumber: string, access: StoredAccess): boolean {
  if (typeof window === 'undefined' || !orderNumber || !access.order_access_token) return false
  memoryAccess.set(orderNumber, access)
  try {
    window.localStorage.setItem(storageKey(orderNumber), JSON.stringify(access))
    return true
  } catch {
    return false
  }
}

export function getOrderAccessToken(orderNumber: string): string | null {
  if (typeof window === 'undefined') return null
  let access = memoryAccess.get(orderNumber)
  try {
    const stored = !access && window.localStorage.getItem(storageKey(orderNumber))
    if (stored) access = JSON.parse(stored) as StoredAccess
  } catch {
    // Restricted storage keeps access available for the current page session.
  }
  if (!access || typeof access.order_access_token !== 'string') return null
  if (access.expires_at && (!Number.isFinite(Date.parse(access.expires_at)) || Date.parse(access.expires_at) <= Date.now())) {
    forgetOrderAccess(orderNumber)
    return null
  }
  return access.order_access_token
}

export function forgetOrderAccess(orderNumber: string) {
  memoryAccess.delete(orderNumber)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(orderNumber))
  } catch {
    // There is no persisted access to remove when the browser blocks storage.
  }
}

export function consumeOrderAccessFragment() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const fragment = new URLSearchParams(url.hash.slice(1))
  if (!fragment.has('access')) return
  const token = fragment.get('access')
  const orderNumber = url.searchParams.get('order')
  if (token && orderNumber) storeOrderAccess(orderNumber, { order_access_token: token })
  fragment.delete('access')
  url.hash = fragment.toString()
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function orderAccessConfig(orderNumber: string) {
  consumeOrderAccessFragment()
  const token = getOrderAccessToken(orderNumber)
  return token ? { headers: { 'X-Order-Access': token } } : undefined
}

export function isOrderAccessRequired(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response
  return response?.status === 403 && response?.data?.code === 'order_access_required'
}
