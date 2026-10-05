export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

export type ColorImageItem = { id: number; url: string }

export type GlobalSize = {
  id: number
  label: string
  slug: string
  cm: string
  sort_order: number
}

export type GlobalColor = {
  id: number
  name: string
  slug: string
  hex_code: string
  sort_order: number
}

// A peluch's available color, enriched with that product's per-color images.
// `images` is only sent by the detail endpoint; list endpoints omit it.
export type PeluchColor = GlobalColor & {
  preview_url: string | null
  image_count: number
  images?: ColorImageItem[]
}

export type ColorUsage = {
  products: number
  photos: number
  orders: number
}

export type SizeUsage = {
  products: number
  orders: number
}

export type Category = {
  id: number
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  is_featured: boolean
  image_url: string | null
}

export type PeluchSizePrice = {
  id: number
  size: GlobalSize
  price: number
  is_available: boolean
  deposit_percentage: number
  full_payment_discount_pct: number
  free_shipping: boolean
  shipping_cost: number
}

export type Peluch = {
  id: number
  title: string
  slug: string
  category_name: string
  category_slug: string
  lead_description: string
  badge: 'none' | 'bestseller' | 'new' | 'limited_edition'
  is_active: boolean
  is_featured: boolean
  discount_pct: number
  display_order: number
  min_price: number | null
  discounted_min_price: number | null
  available_colors: PeluchColor[]
  gallery_urls: string[]
  average_rating: number
  review_count: number
  has_huella: boolean
  has_corazon: boolean
  has_audio: boolean
}

export type PeluchDetail = Peluch & {
  category: Category
  description: string[]
  specifications: Record<string, string>
  care_instructions: string[]
  size_prices: PeluchSizePrice[]
  view_count: number
  huella_extra_cost: number
  corazon_extra_cost: number
  audio_extra_cost: number
  created_at: string
  updated_at: string
}

// ── Carrito ───────────────────────────────────────────────────────────────────

export type CartItem = {
  peluch_id: number
  peluch_slug: string
  title: string
  size_id: number
  size_label: string
  color_id: number
  color_name: string
  color_hex: string
  unit_price: number
  personalization_cost: number
  quantity: number
  gallery_urls: string[]
  has_huella: boolean
  huella_type: 'name' | 'date' | 'letter' | 'image' | ''
  huella_text: string
  huella_media_id: number | null
  has_corazon: boolean
  corazon_phrase: string
  has_audio: boolean
  audio_media_id: number | null
  deposit_percentage: number
  full_payment_discount_pct: number
  free_shipping: boolean
  shipping_cost: number
}

export type PaymentMode = 'deposit' | 'full'

// ── Órdenes ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending_payment'
  | 'payment_confirmed'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export type OrderListItem = {
  id: number
  order_number: string
  customer_name: string
  customer_email: string
  city: string
  department: string
  status: OrderStatus
  total_amount: number
  deposit_amount: number
  balance_amount: number
  shipping_amount: number
  discount_amount: number
  payment_mode: PaymentMode
  amount_paid_now: number
  created_at: string
}

export type OrderItemRead = {
  id: number
  peluch_title: string
  peluch_slug: string
  size: GlobalSize | null
  color: GlobalColor | null
  quantity: number
  unit_price: number
  personalization_cost: number
  line_total: number
  has_huella: boolean
  huella_type: string
  huella_text: string
  huella_media_url: string | null
  has_corazon: boolean
  corazon_phrase: string
  has_audio: boolean
  audio_media_url: string | null
  audio_duration_sec: number | null
  audio_size_kb: number | null
  configuration_snapshot: Record<string, unknown>
}

export type StatusHistoryEntry = {
  id: number
  previous_status: string
  new_status: string
  changed_by_email: string
  notes: string
  changed_at: string
}

export type WompiPaymentInfo = {
  reference: string
  status: string
  payment_method_type: string
  checkout_url: string
  created_at: string
}

export type OrderDetail = OrderListItem & {
  customer_phone: string
  address: string
  postal_code: string
  tracking_number: string
  shipping_carrier: string
  notes: string
  updated_at: string
  items: OrderItemRead[]
  status_history: StatusHistoryEntry[]
  payment: WompiPaymentInfo | null
}

export type OrderTrackingInfo = {
  order_number: string
  status: OrderStatus
  tracking_number: string
  shipping_carrier: string
  created_at: string
  updated_at: string
  payment_status: string | null
  checkout_url: string | null
  customer_name: string
  customer_phone: string
  address: string
  city: string
  department: string
  postal_code: string
  items: OrderItemRead[]
}

export type OrderCreateResponse = {
  order_number: string
  deposit_amount: number
  balance_amount: number
  shipping_amount: number
  discount_amount: number
  payment_mode: PaymentMode
  amount_paid_now: number
  total_amount: number
  is_guest: boolean
}

// ── Reseñas ───────────────────────────────────────────────────────────────────

export type Review = {
  id: number
  user_email: string
  user_name: string
  rating: number
  comment: string
  created_at: string
}

export type HomeReview = {
  id: number
  user_name: string
  rating: number
  comment: string
  peluch_title: string
  created_at: string
}

// ── Media ─────────────────────────────────────────────────────────────────────

export type MediaUploadResponse = {
  media_id: number
  file_url: string
  file_size_kb: number
  duration_sec: number | null
}

// ── Usuarios (auth — sin cambios) ─────────────────────────────────────────────

export type User = {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  is_staff: boolean
}

export type UserListItem = {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  is_staff: boolean
  is_active: boolean
  email_verified: boolean
  date_joined: string
}

export type Blog = {
  id: number
  title: string
  category?: string
  description?: string
  image_url?: string
}

export type Product = Peluch
