import { api } from './http'
import { orderAccessConfig } from '../utils/orderAccess'

const WOMPI_API_URL = process.env.NEXT_PUBLIC_WOMPI_API_URL ?? ''
const WOMPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? ''

// Fail loud if the Wompi config is missing instead of silently falling back to a
// default environment (this was the root cause of the prod failure: frontend on
// sandbox with an empty key while the backend used production). NEXT_PUBLIC_* is
// baked at build time → after setting these you must rebuild the frontend.
function assertWompiConfigured(): void {
  if (!WOMPI_API_URL || !WOMPI_PUBLIC_KEY) {
    throw new Error(
      'Wompi no está configurado: definí NEXT_PUBLIC_WOMPI_API_URL y NEXT_PUBLIC_WOMPI_PUBLIC_KEY ' +
        'y reconstruí el frontend (npm run build) — estas variables se hornean en build time.',
    )
  }
}

export type PaymentInfo = {
  order_number: string
  reference: string
  amount_in_cents: number
  currency: string
  total_amount: number
  deposit_amount: number
  balance_amount: number
  shipping_amount: number
  discount_amount: number
  payment_mode: 'deposit' | 'full'
  amount_paid_now: number
  customer_name: string
  customer_email: string
  customer_phone: string
  status: string
}

export type PaymentResult = {
  status: 'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | string
  redirect_url: string
  wompi_id: string
  status_message?: string
}

export type PseBank = {
  financial_institution_code: string
  financial_institution_name: string
}

export type CardTokenData = {
  number: string
  cvc: string
  exp_month: string
  exp_year: string
  card_holder: string
}

export type AcceptanceTokens = {
  acceptance_token: string
  acceptance_permalink: string
  personal_auth_token: string
}

export const paymentService = {
  getInfo: (orderNumber: string) =>
    api.get<PaymentInfo>(`/payment/info/${orderNumber}/`, orderAccessConfig(orderNumber)).then((r) => r.data),

  getPseBanks: () =>
    api.get<PseBank[]>('/payment/pse-banks/').then((r) => r.data),

  pollStatus: (orderNumber: string) =>
    api.get<PaymentInfo>(`/payment/info/${orderNumber}/`, orderAccessConfig(orderNumber)).then((r) => r.data),

  checkStatus: (orderNumber: string) =>
    api
      .get<{
        status: string
        order_status: string
        synced: boolean
        wompi_status_message: string
        payment_method_type: string
        amount_in_cents: number
      }>(`/payment/check/${orderNumber}/`, orderAccessConfig(orderNumber))
      .then((r) => r.data),

  getAcceptanceTokens: async (): Promise<AcceptanceTokens> => {
    assertWompiConfigured()
    const resp = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`)
    const json = await resp.json()
    const data = json.data ?? {}
    return {
      acceptance_token: data.presigned_acceptance?.acceptance_token ?? '',
      acceptance_permalink: data.presigned_acceptance?.permalink ?? '',
      personal_auth_token: data.presigned_personal_data_auth?.acceptance_token ?? '',
    }
  },

  processCard: (orderNumber: string, cardToken: string, acceptanceToken: string, personalAuthToken: string) =>
    api
      .post<PaymentResult>('/payment/process/', {
        order_number: orderNumber,
        method: 'CARD',
        card_token: cardToken,
        installments: 1,
        acceptance_token: acceptanceToken,
        acceptance_personal_auth_token: personalAuthToken,
      }, orderAccessConfig(orderNumber))
      .then((r) => r.data),

  processNequi: (orderNumber: string, phoneNumber: string, acceptanceToken: string, personalAuthToken: string) =>
    api
      .post<PaymentResult>('/payment/process/', {
        order_number: orderNumber,
        method: 'NEQUI',
        phone_number: phoneNumber,
        acceptance_token: acceptanceToken,
        acceptance_personal_auth_token: personalAuthToken,
      }, orderAccessConfig(orderNumber))
      .then((r) => r.data),

  processPse: (
    orderNumber: string,
    bankCode: string,
    userType: number,
    userLegalIdType: string,
    userLegalId: string,
    acceptanceToken: string,
    personalAuthToken: string,
  ) =>
    api
      .post<PaymentResult>('/payment/process/', {
        order_number: orderNumber,
        method: 'PSE',
        bank_code: bankCode,
        user_type: userType,
        user_legal_id_type: userLegalIdType,
        user_legal_id: userLegalId,
        acceptance_token: acceptanceToken,
        acceptance_personal_auth_token: personalAuthToken,
      }, orderAccessConfig(orderNumber))
      .then((r) => r.data),

  processBancolombia: (
    orderNumber: string,
    acceptanceToken: string,
    personalAuthToken: string,
  ) =>
    // Wompi only supports user_type="PERSON" for BANCOLOMBIA_TRANSFER in single payments
    // and does not accept user_legal_id* fields in this method — the bank collects them.
    api
      .post<PaymentResult>('/payment/process/', {
        order_number: orderNumber,
        method: 'BANCOLOMBIA_TRANSFER',
        acceptance_token: acceptanceToken,
        acceptance_personal_auth_token: personalAuthToken,
      }, orderAccessConfig(orderNumber))
      .then((r) => r.data),

  tokenizeCard: async (data: CardTokenData): Promise<string> => {
    assertWompiConfigured()
    const resp = await fetch(`${WOMPI_API_URL}/tokens/cards`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WOMPI_PUBLIC_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      const msgs = err?.error?.messages ?? {}
      const msg = msgs.number?.[0] || msgs.cvc?.[0] || msgs.exp_month?.[0] || 'Datos de tarjeta inválidos.'
      throw new Error(msg)
    }
    const json = await resp.json()
    return json.data.id as string
  },
}
