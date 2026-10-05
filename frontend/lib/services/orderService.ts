import { api } from './http'
import { orderAccessConfig } from '../utils/orderAccess'
import type {
  CartItem,
  OrderCreateResponse,
  OrderDetail,
  OrderListItem,
  OrderTrackingInfo,
  PaginatedResponse,
  PaymentMode,
} from '../types'

export const orderService = {
  createOrder: (data: {
    customer_name: string
    customer_email: string
    customer_phone: string
    address: string
    city: string
    department: string
    postal_code: string
    notes?: string
    items: CartItem[]
    payment_mode?: PaymentMode
  }) => {
    const payload = {
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      customer_phone: data.customer_phone,
      address: data.address,
      city: data.city,
      department: data.department,
      postal_code: data.postal_code,
      notes: data.notes ?? '',
      payment_mode: data.payment_mode ?? 'deposit',
      items: data.items.map((i) => ({
        peluch_id: i.peluch_id,
        size_id: i.size_id,
        color_id: i.color_id,
        quantity: i.quantity,
        has_huella: i.has_huella,
        huella_type: i.huella_type || '',
        huella_text: i.huella_text,
        huella_media_id: i.huella_media_id,
        huella_media_token: i.huella_media_token,
        has_corazon: i.has_corazon,
        corazon_phrase: i.corazon_phrase,
        has_audio: i.has_audio,
        audio_media_id: i.audio_media_id,
        audio_media_token: i.audio_media_token,
      })),
    }
    return api.post<OrderCreateResponse>('/orders/', payload).then((r) => r.data)
  },

  getMyOrders: () => api.get<OrderListItem[]>('/orders/my/').then((r) => r.data),

  trackOrder: (orderNumber: string) =>
    api.get<OrderTrackingInfo>(`/orders/track/${orderNumber}/`, orderAccessConfig(orderNumber)).then((r) => r.data),

  getOrderDetail: (orderNumber: string) =>
    api.get<OrderDetail>(`/orders/${orderNumber}/`).then((r) => r.data),

  listOrders: (
    params?: { status?: string; city?: string; page?: number; page_size?: number },
    options?: { signal?: AbortSignal },
  ) =>
    api.get<PaginatedResponse<OrderListItem>>('/orders/list/', { params, ...options }).then((r) => r.data),

  updateStatus: (orderNumber: string, status: string, notes?: string) =>
    api
      .patch<OrderDetail>(`/orders/${orderNumber}/status/`, { status, notes })
      .then((r) => r.data),

  updateTracking: (orderNumber: string, tracking_number: string, shipping_carrier?: string) =>
    api
      .patch<OrderDetail>(`/orders/${orderNumber}/tracking/`, { tracking_number, shipping_carrier })
      .then((r) => r.data),
}
