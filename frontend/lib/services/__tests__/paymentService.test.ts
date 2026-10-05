import { afterEach, describe, it, expect, beforeEach } from '@jest/globals'

jest.mock('../http', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

import { api } from '../http'
import { paymentService } from '../paymentService'
import { forgetOrderAccess, storeOrderAccess } from '../../utils/orderAccess'

const mockGet = api.get as jest.Mock
const mockPost = api.post as jest.Mock

const mockPaymentInfo = {
  order_number: 'ORD-001',
  reference: 'REF-001',
  amount_in_cents: 12800000,
  currency: 'COP',
  total_amount: 128000,
  deposit_amount: 0,
  balance_amount: 128000,
  customer_name: 'Ana García',
  customer_email: 'ana@test.com',
  customer_phone: '3001234567',
  status: 'pending',
}

const mockPaymentResult = {
  status: 'APPROVED',
  redirect_url: '',
  wompi_id: 'wompi-123',
}
const futureExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const orderGrant = { order_access_token: 'order-payment-token', expires_at: futureExpiry() }
const orderGrantConfig = { headers: { 'X-Order-Access': 'order-payment-token' } }

describe('paymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    forgetOrderAccess('ORD-001')
    forgetOrderAccess('ORD-PAYMENT')
    global.fetch = jest.fn()
  })

  afterEach(() => {
    forgetOrderAccess('ORD-001')
    forgetOrderAccess('ORD-PAYMENT')
  })

  describe('getInfo', () => {
    it('fetches payment info for an order', async () => {
      mockGet.mockResolvedValue({ data: mockPaymentInfo })
      const result = await paymentService.getInfo('ORD-001')
      expect(mockGet).toHaveBeenCalledWith('/payment/info/ORD-001/', undefined)
      expect(result).toEqual(mockPaymentInfo)
    })

    it('throws on network error when fetching payment info', async () => {
      mockGet.mockRejectedValue(new Error('Network Error'))
      await expect(paymentService.getInfo('ORD-001')).rejects.toThrow('Network Error')
    })
  })

  describe('getPseBanks', () => {
    it('fetches list of PSE banks', async () => {
      const mockBanks = [{ financial_institution_code: '1', financial_institution_name: 'Bancolombia' }]
      mockGet.mockResolvedValue({ data: mockBanks })
      const result = await paymentService.getPseBanks()
      expect(mockGet).toHaveBeenCalledWith('/payment/pse-banks/')
      expect(result).toEqual(mockBanks)
    })
  })

  describe('pollStatus', () => {
    it('polls payment info endpoint by order number', async () => {
      mockGet.mockResolvedValue({ data: mockPaymentInfo })
      storeOrderAccess('ORD-001', orderGrant)
      const result = await paymentService.pollStatus('ORD-001')
      expect(mockGet).toHaveBeenCalledWith('/payment/info/ORD-001/', orderGrantConfig)
      expect(result).toEqual(mockPaymentInfo)
    })
  })

  it('scopes payment headers to the matching order', async () => {
    // Fails if one purchaser's credential reaches a different payment order.
    storeOrderAccess('ORD-PAYMENT', { order_access_token: 'payment-token', expires_at: futureExpiry() })
    mockGet.mockResolvedValue({ data: mockPaymentInfo })

    await paymentService.getInfo('ORD-PAYMENT')
    await paymentService.getInfo('ORD-OTHER')

    expect(mockGet).toHaveBeenNthCalledWith(1, '/payment/info/ORD-PAYMENT/', { headers: { 'X-Order-Access': 'payment-token' } })
    expect(mockGet).toHaveBeenNthCalledWith(2, '/payment/info/ORD-OTHER/', undefined)
  })

  it('does not send order access to Wompi', async () => {
    // Fails if an order capability leaks to the public payment provider.
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValue({ json: jest.fn().mockResolvedValue({ data: {} }) })

    await paymentService.getAcceptanceTokens()

    expect(mockFetch).toHaveBeenCalledWith('https://sandbox.wompi.co/v1/merchants/pub_test_jest')
  })

  describe('checkStatus', () => {
    it('checks payment sync status for an order', async () => {
      const mockStatus = { status: 'APPROVED', synced: true }
      mockGet.mockResolvedValue({ data: mockStatus })
      storeOrderAccess('ORD-001', orderGrant)
      const result = await paymentService.checkStatus('ORD-001')
      expect(mockGet).toHaveBeenCalledWith('/payment/check/ORD-001/', orderGrantConfig)
      expect(result).toEqual(mockStatus)
    })
  })

  describe('getAcceptanceTokens', () => {
    it('extracts acceptance tokens from Wompi merchant response', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          data: {
            presigned_acceptance: { acceptance_token: 'tok-accept', permalink: 'https://wompi.co/terms' },
            presigned_personal_data_auth: { acceptance_token: 'tok-personal' },
          },
        }),
      })
      const result = await paymentService.getAcceptanceTokens()
      expect(result.acceptance_token).toBe('tok-accept')
      expect(result.acceptance_permalink).toBe('https://wompi.co/terms')
      expect(result.personal_auth_token).toBe('tok-personal')
    })

    it('returns empty strings when Wompi response is missing presigned fields', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ data: {} }),
      })
      const result = await paymentService.getAcceptanceTokens()
      expect(result.acceptance_token).toBe('')
      expect(result.acceptance_permalink).toBe('')
      expect(result.personal_auth_token).toBe('')
    })
  })

  describe('processCard', () => {
    it('posts card payment with token and acceptance data', async () => {
      mockPost.mockResolvedValue({ data: mockPaymentResult })
      storeOrderAccess('ORD-001', orderGrant)
      const result = await paymentService.processCard('ORD-001', 'card-tok', 'acc-tok', 'personal-tok')
      expect(mockPost).toHaveBeenCalledWith('/payment/process/', {
        order_number: 'ORD-001',
        method: 'CARD',
        card_token: 'card-tok',
        installments: 1,
        acceptance_token: 'acc-tok',
        acceptance_personal_auth_token: 'personal-tok',
      }, orderGrantConfig)
      expect(result).toEqual(mockPaymentResult)
    })

    it('throws when card processing returns a server error', async () => {
      mockPost.mockRejectedValue(new Error('Request failed with status code 500'))
      await expect(
        paymentService.processCard('ORD-001', 'card-tok', 'acc-tok', 'personal-tok')
      ).rejects.toThrow('Request failed with status code 500')
    })
  })

  describe('processNequi', () => {
    it('posts Nequi payment with phone number', async () => {
      mockPost.mockResolvedValue({ data: mockPaymentResult })
      storeOrderAccess('ORD-001', orderGrant)
      const result = await paymentService.processNequi('ORD-001', '3001234567', 'acc-tok', 'personal-tok')
      expect(mockPost).toHaveBeenCalledWith('/payment/process/', {
        order_number: 'ORD-001',
        method: 'NEQUI',
        phone_number: '3001234567',
        acceptance_token: 'acc-tok',
        acceptance_personal_auth_token: 'personal-tok',
      }, orderGrantConfig)
      expect(result).toEqual(mockPaymentResult)
    })
  })

  describe('processPse', () => {
    it('posts PSE payment with bank and user legal details', async () => {
      mockPost.mockResolvedValue({ data: mockPaymentResult })
      storeOrderAccess('ORD-001', orderGrant)
      const result = await paymentService.processPse('ORD-001', '1007', 0, 'CC', '12345678', 'acc-tok', 'personal-tok')
      expect(mockPost).toHaveBeenCalledWith('/payment/process/', {
        order_number: 'ORD-001',
        method: 'PSE',
        bank_code: '1007',
        user_type: 0,
        user_legal_id_type: 'CC',
        user_legal_id: '12345678',
        acceptance_token: 'acc-tok',
        acceptance_personal_auth_token: 'personal-tok',
      }, orderGrantConfig)
      expect(result).toEqual(mockPaymentResult)
    })
  })

  describe('processBancolombia', () => {
    it('posts Bancolombia transfer payment with minimal payload (Wompi captures user_type/id at the bank)', async () => {
      mockPost.mockResolvedValue({ data: mockPaymentResult })
      storeOrderAccess('ORD-001', orderGrant)
      await paymentService.processBancolombia('ORD-001', 'acc-tok', 'personal-tok')
      expect(mockPost).toHaveBeenCalledWith('/payment/process/', {
        order_number: 'ORD-001',
        method: 'BANCOLOMBIA_TRANSFER',
        acceptance_token: 'acc-tok',
        acceptance_personal_auth_token: 'personal-tok',
      }, orderGrantConfig)
    })
  })

  describe('tokenizeCard', () => {
    it('returns card token id on successful tokenization', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: { id: 'tok_card_123' } }),
      })
      const result = await paymentService.tokenizeCard({
        number: '4111111111111111',
        cvc: '123',
        exp_month: '12',
        exp_year: '2030',
        card_holder: 'ANA GARCIA',
      })
      expect(result).toBe('tok_card_123')
    })

    it('throws error with card field message when tokenization fails', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: { messages: { number: ['Número de tarjeta inválido.'] } },
        }),
      })
      await expect(
        paymentService.tokenizeCard({
          number: '0000',
          cvc: '123',
          exp_month: '12',
          exp_year: '2030',
          card_holder: 'ANA GARCIA',
        })
      ).rejects.toThrow('Número de tarjeta inválido.')
    })

    it('throws generic message when tokenization fails without field-specific messages', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: { messages: {} } }),
      })
      await expect(
        paymentService.tokenizeCard({
          number: '4111111111111111',
          cvc: '123',
          exp_month: '12',
          exp_year: '2030',
          card_holder: 'ANA GARCIA',
        })
      ).rejects.toThrow('Datos de tarjeta inválidos.')
    })
  })

  describe('Wompi configuration guard', () => {
    it('throws a clear error when Wompi env vars are missing', async () => {
      const prevUrl = process.env.NEXT_PUBLIC_WOMPI_API_URL
      const prevKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY
      delete process.env.NEXT_PUBLIC_WOMPI_API_URL
      delete process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY
      jest.resetModules()

      const { paymentService: freshService } = await import('../paymentService')
      await expect(freshService.getAcceptanceTokens()).rejects.toThrow(/Wompi no está configurado/)

      process.env.NEXT_PUBLIC_WOMPI_API_URL = prevUrl
      process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY = prevKey
    })
  })
})
