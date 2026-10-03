import { api } from './http'
import type { OrderAccessGrant } from '../types'

export const orderAccessService = {
  requestCode: (orderNumber: string, email: string) =>
    api.post<{ detail: string }>(`/orders/${encodeURIComponent(orderNumber)}/access/request/`, { email })
      .then((response) => response.data),

  verifyCode: (orderNumber: string, email: string, code: string) =>
    api.post<OrderAccessGrant>(`/orders/${encodeURIComponent(orderNumber)}/access/verify/`, { email, code })
      .then((response) => response.data),
}
