import { afterEach, describe, it, expect, beforeEach } from '@jest/globals'

jest.mock('../http', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}))

import { api } from '../http'
import { orderService } from '../orderService'
import { mockCartItems } from '../../__tests__/fixtures'
import { forgetOrderAccess, storeOrderAccess } from '../../utils/orderAccess'

const mockGet = api.get as jest.Mock
const mockPost = api.post as jest.Mock
const mockPatch = api.patch as jest.Mock
const futureExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

describe('orderService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    forgetOrderAccess('ORD-A')
    forgetOrderAccess('ORD-001')
  })

  afterEach(() => {
    forgetOrderAccess('ORD-A')
    forgetOrderAccess('ORD-001')
  })

  describe('createOrder', () => {
    it('posts order payload with mapped cart items', async () => {
      const mockResponse = { order_number: 'ORD-001' }
      mockPost.mockResolvedValue({ data: mockResponse })

      const result = await orderService.createOrder({
        customer_name: 'Ana García',
        customer_email: 'ana@test.com',
        customer_phone: '3001234567',
        address: 'Calle 1 #2-3',
        city: 'Medellín',
        department: 'Antioquia',
        postal_code: '050001',
        items: mockCartItems,
      })

      expect(mockPost).toHaveBeenCalledWith(
        '/orders/',
        expect.objectContaining({
          customer_name: 'Ana García',
          customer_email: 'ana@test.com',
          notes: '',
          items: expect.arrayContaining([
            expect.objectContaining({ peluch_id: 1, quantity: 2 }),
          ]),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  it('keeps both media capabilities in the created order payload', async () => {
    // Fails if the checkout loses a successfully uploaded media authorization.
    mockPost.mockResolvedValue({ data: { order_number: 'ORD-MEDIA' } })

    await orderService.createOrder({
      customer_name: 'Ana García', customer_email: 'ana@test.com', customer_phone: '3001234567',
      address: 'Calle 1 #2-3', city: 'Medellín', department: 'Antioquia', postal_code: '050001',
      items: [{
        ...mockCartItems[0], quantity: 2, has_huella: true, huella_media_id: 41,
        huella_media_token: 'huella-capability', has_audio: true, audio_media_id: 42,
        audio_media_token: 'audio-capability',
      }],
    })

    expect(mockPost).toHaveBeenCalledWith('/orders/', expect.objectContaining({
      items: [{
        peluch_id: 1, size_id: 2, color_id: 1, quantity: 2,
        has_huella: true, huella_media_id: 41, huella_media_token: 'huella-capability',
        has_audio: true, audio_media_id: 42, audio_media_token: 'audio-capability',
        huella_type: '', huella_text: '', has_corazon: false, corazon_phrase: '',
      }],
    }))
  })

  describe('getMyOrders', () => {
    it('fetches authenticated user orders', async () => {
      const mockOrders = [{ order_number: 'ORD-001', status: 'pending' }]
      mockGet.mockResolvedValue({ data: mockOrders })
      const result = await orderService.getMyOrders()
      expect(mockGet).toHaveBeenCalledWith('/orders/my/')
      expect(result).toEqual(mockOrders)
    })
  })

  describe('trackOrder', () => {
    it('fetches tracking info by order number', async () => {
      const mockTracking = { order_number: 'ORD-001', status: 'shipped' }
      mockGet.mockResolvedValue({ data: mockTracking })
      const result = await orderService.trackOrder('ORD-001')
      expect(mockGet).toHaveBeenCalledWith('/orders/track/ORD-001/', undefined)
      expect(result).toEqual(mockTracking)
    })
  })

  it('sends a tracking capability only to its matching order', async () => {
    // Fails if one purchaser's capability authorizes a different order lookup.
    storeOrderAccess('ORD-A', { order_access_token: 'token-a', expires_at: futureExpiry() })
    mockGet.mockResolvedValue({ data: { order_number: 'ORD-A' } })

    await orderService.trackOrder('ORD-A')
    await orderService.trackOrder('ORD-B')

    expect(mockGet).toHaveBeenNthCalledWith(1, '/orders/track/ORD-A/', { headers: { 'X-Order-Access': 'token-a' } })
    expect(mockGet).toHaveBeenNthCalledWith(2, '/orders/track/ORD-B/', undefined)
  })

  describe('getOrderDetail', () => {
    it('fetches full order details by order number', async () => {
      const mockDetail = { order_number: 'ORD-001', items: [] }
      mockGet.mockResolvedValue({ data: mockDetail })
      const result = await orderService.getOrderDetail('ORD-001')
      expect(mockGet).toHaveBeenCalledWith('/orders/ORD-001/')
      expect(result).toEqual(mockDetail)
    })
  })

  describe('listOrders', () => {
    it('fetches orders list with status filter', async () => {
      mockGet.mockResolvedValue({ data: [] })
      const params = { status: 'pending', city: 'Medellín' }
      await orderService.listOrders(params)
      expect(mockGet).toHaveBeenCalledWith('/orders/list/', { params })
    })

    it('returns the paginated order envelope without flattening its metadata', async () => {
      const page = {
        count: 201,
        next: 'https://api.example.test/orders/list/?page=3',
        previous: 'https://api.example.test/orders/list/?page=1',
        results: [{ order_number: 'MIM-PROD-001', status: 'in_production' }],
      }
      mockGet.mockResolvedValue({ data: page })

      const result = await orderService.listOrders(
        { status: 'in_production', page: 2, page_size: 100 },
      )

      // Fails if pagination parameters or response links are lost at the API boundary.
      expect(mockGet).toHaveBeenCalledWith('/orders/list/', {
        params: { status: 'in_production', page: 2, page_size: 100 },
      })
      expect(result).toEqual(page)
    })

    it('forwards an abort signal with the paginated order request', async () => {
      const controller = new AbortController()
      mockGet.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })

      await orderService.listOrders(
        { status: 'in_production', page: 2, page_size: 100 },
        { signal: controller.signal },
      )

      // Fails if a superseded paginated request cannot be cancelled at the API boundary.
      expect(mockGet).toHaveBeenCalledWith('/orders/list/', {
        params: { status: 'in_production', page: 2, page_size: 100 },
        signal: controller.signal,
      })
    })
  })

  describe('updateStatus', () => {
    it('patches order status with optional notes', async () => {
      const mockUpdated = { order_number: 'ORD-001', status: 'confirmed' }
      mockPatch.mockResolvedValue({ data: mockUpdated })
      const result = await orderService.updateStatus('ORD-001', 'confirmed', 'Verificado')
      expect(mockPatch).toHaveBeenCalledWith('/orders/ORD-001/status/', {
        status: 'confirmed',
        notes: 'Verificado',
      })
      expect(result).toEqual(mockUpdated)
    })
  })

  describe('updateTracking', () => {
    it('patches order with tracking number and shipping carrier', async () => {
      const mockUpdated = { order_number: 'ORD-001', tracking_number: 'TRK123' }
      mockPatch.mockResolvedValue({ data: mockUpdated })
      const result = await orderService.updateTracking('ORD-001', 'TRK123', 'Servientrega')
      expect(mockPatch).toHaveBeenCalledWith('/orders/ORD-001/tracking/', {
        tracking_number: 'TRK123',
        shipping_carrier: 'Servientrega',
      })
      expect(result).toEqual(mockUpdated)
    })
  })

it('sends both sibling configurations without their local identities', async () => {
  jest.clearAllMocks()
  // Catches a local line ID leaking into the order contract or the second configuration disappearing.
  mockPost.mockResolvedValue({ data: { order_number: 'ORD-SIBLINGS' } })
  await orderService.createOrder({
    customer_name: 'Ana', customer_email: 'ana@example.com', customer_phone: '3001234567',
    address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca', postal_code: '',
    items: [
      { ...mockCartItems[0], quantity: 1, cart_line_id: 'local-luna', huella_text: 'Luna', huella_media_id: 41, huella_media_token: 'image-luna', audio_media_id: 51, audio_media_token: 'audio-luna' },
      { ...mockCartItems[0], quantity: 1, cart_line_id: 'local-sol', huella_text: 'Sol', huella_media_id: 42, huella_media_token: 'image-sol', audio_media_id: 52, audio_media_token: 'audio-sol' },
    ],
  })

  const payload = mockPost.mock.calls[0][1] as { items: Array<Record<string, unknown>> }
  expect(payload.items).toHaveLength(2)
  expect(payload.items[0]).toEqual(expect.objectContaining({ huella_text: 'Luna', huella_media_id: 41, huella_media_token: 'image-luna', audio_media_id: 51, audio_media_token: 'audio-luna' }))
  expect(payload.items[1]).toEqual(expect.objectContaining({ huella_text: 'Sol', huella_media_id: 42, huella_media_token: 'image-sol', audio_media_id: 52, audio_media_token: 'audio-sol' }))
  expect(payload.items[0]).not.toHaveProperty('cart_line_id')
  expect(payload.items[1]).not.toHaveProperty('cart_line_id')
})

})
