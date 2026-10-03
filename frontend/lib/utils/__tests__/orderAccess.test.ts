import { afterEach, describe, expect, it, jest } from '@jest/globals'

import {
  consumeOrderAccessFragment,
  getOrderAccessToken,
  forgetOrderAccess,
  orderAccessConfig,
  storeOrderAccess,
} from '../orderAccess'

const futureExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

describe('orderAccess', () => {
  afterEach(() => {
    localStorage.clear()
    forgetOrderAccess('ORD-A')
    forgetOrderAccess('ORD-B')
    forgetOrderAccess('ORD-C')
    forgetOrderAccess('ORD-MEMORY')
    forgetOrderAccess('ORD-BROKEN')
    forgetOrderAccess('ORD-EXPIRED')
    forgetOrderAccess('ORD-FRAGMENT')
    window.history.replaceState({}, '', '/')
    jest.restoreAllMocks()
  })

  it('keeps a stored grant scoped to its order number', () => {
    // Fails if a capability for one order is attached to another order request.
    storeOrderAccess('ORD-A', { order_access_token: 'token-a', expires_at: futureExpiry() })
    storeOrderAccess('ORD-B', { order_access_token: 'token-b', expires_at: futureExpiry() })

    expect(orderAccessConfig('ORD-A')).toEqual({ headers: { 'X-Order-Access': 'token-a' } })
    expect(orderAccessConfig('ORD-B')).toEqual({ headers: { 'X-Order-Access': 'token-b' } })
    expect(orderAccessConfig('ORD-C')).toBeUndefined()
  })

  it('retains the current-page grant when browser storage rejects writes', () => {
    // Fails if privacy-restricted storage locks a buyer out after code verification.
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied') })

    expect(storeOrderAccess('ORD-MEMORY', { order_access_token: 'memory-token' })).toBe(false)
    expect(orderAccessConfig('ORD-MEMORY')).toEqual({ headers: { 'X-Order-Access': 'memory-token' } })
  })

  it('drops a malformed persisted grant without sending a header', () => {
    // Fails if corrupt local storage crashes a private page or sends an invalid credential.
    localStorage.setItem('mimittos_order_access:ORD-BROKEN', '{not-json')

    expect(getOrderAccessToken('ORD-BROKEN')).toBeNull()
    expect(orderAccessConfig('ORD-BROKEN')).toBeUndefined()
  })

  it('drops an expired grant before configuring a private request', () => {
    // Fails if an expired link still authorizes an order request.
    localStorage.setItem('mimittos_order_access:ORD-EXPIRED', JSON.stringify({
      order_access_token: 'expired-token',
      expires_at: '2000-01-01T00:00:00Z',
    }))

    expect(orderAccessConfig('ORD-EXPIRED')).toBeUndefined()
    expect(localStorage.getItem('mimittos_order_access:ORD-EXPIRED')).toBeNull()
  })

  it('stores a fragment grant then removes the fragment from the visible URL', () => {
    // Fails if a token remains in the URL where analytics or copied links can expose it.
    window.history.replaceState({}, '', '/payment?order=ORD-FRAGMENT#access=fragment-token')
    const replaceState = jest.spyOn(window.history, 'replaceState')

    consumeOrderAccessFragment()

    expect(orderAccessConfig('ORD-FRAGMENT')).toEqual({ headers: { 'X-Order-Access': 'fragment-token' } })
    expect(window.location.hash).toBe('')
    expect(replaceState).toHaveBeenCalledWith({}, '', '/payment?order=ORD-FRAGMENT')
  })
})
