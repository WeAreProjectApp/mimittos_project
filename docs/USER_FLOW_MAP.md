# User Flow Map

**Single source of truth for all user flows in the application.**

Use this document to understand each flow's steps, branching conditions, role restrictions, and API contracts before writing or reviewing E2E tests.

**Version:** 1.5.6
**Last Updated:** 2026-10-08

---

## Table of Contents

1. [Module Index](#module-index)
2. [Auth Module](#auth-module)
3. [Public Module](#public-module)
4. [App Module](#app-module)
5. [Payment Module](#payment-module)
6. [Reviews Module](#reviews-module)
7. [Backoffice Module](#backoffice-module)
8. [Cross-Reference](#cross-reference)

---

## Module Index

| Flow ID | Name | Module | Priority | Roles | Frontend Route |
|---------|------|--------|----------|-------|----------------|
| `auth-sign-in` | Sign In | auth | P1 | guest | `/sign-in` |
| `auth-sign-up` | Sign Up | auth | P1 | guest | `/sign-up` |
| `auth-google-login` | Google OAuth Login | auth | P2 | guest | `/sign-in`, `/sign-up` |
| `auth-forgot-password` | Forgot Password | auth | P2 | guest | `/forgot-password` |
| `auth-sign-out` | Sign Out | auth | P2 | user | `/dashboard` |
| `auth-session-persistence` | Session Persistence | auth | P2 | user | any protected route |
| `public-home` | Home Page | public | P2 | guest | `/` |
| `public-navigation` | Site Navigation | public | P3 | guest | all pages |
| `public-catalog-browse` | Browse Catalog | public | P2 | guest | `/catalog` |
| `public-peluch-detail` | Peluch Detail | public | P2 | guest | `/peluches/[slug]` |
| `public-blogs-browse` | Browse Blogs | public | P3 | guest | `/blogs` |
| `public-blog-detail` | Blog Detail | public | P3 | guest | `/blogs/[blogId]` |
| `app-cart-add` | Add Peluch to Cart | app | P1 | guest | `/peluches/[slug]` |
| `app-cart-manage` | Manage Cart | app | P1 | guest | `/cart` |
| `app-cart-persistence` | Cart Persistence | app | P2 | guest | `/cart` |
| `checkout-wompi-redirect` | Create Order and Open Payment | checkout | P1 | shared | `/checkout` |
| `app-peluch-size-color` | Select Size and Color | app | P2 | guest | `/peluches/[slug]` |
| `app-peluch-huella` | Configure Huella | app | P2 | guest | `/peluches/[slug]` |
| `app-peluch-corazon` | Configure Corazón | app | P2 | guest | `/peluches/[slug]` |
| `app-peluch-audio` | Upload Audio | app | P3 | guest | `/peluches/[slug]` |
| `app-orders-list` | My Orders | app | P2 | user | `/orders` |
| `app-tracking` | Track Order | app | P2 | shared | `/tracking` |
| `app-tracking-wompi` | Auto-Track from Wompi | app | P3 | shared | `/tracking?order=...` |
| `app-dashboard` | Dashboard | app | P2 | user | `/dashboard` |
| `backoffice-users-list` | Users List | backoffice | P2 | staff | `/backoffice` |
| `backoffice-orders-list` | Orders List | backoffice | P2 | staff | `/backoffice` |
| `auth-login-success` | Successful Sign-In | auth | P1 | guest | `/sign-in` |
| `auth-registration-verify` | Email Verification | auth | P2 | guest | `/sign-up` |
| `payment-page-display` | Payment Page | payment | P1 | shared | `/payment` |
| `order-confirmed-display` | Order Confirmed | payment | P1 | shared | `/order-confirmed` |
| `review-submit` | Submit Review | reviews | P2 | user | `/peluches/[slug]` |
| `backoffice-navigation` | Responsive Backoffice Navigation | backoffice | P3 | staff | `/backoffice`, `/backoffice/pedidos` |
| `backoffice-login` | Staff Sign-In | backoffice | P2 | staff | `/sign-in` |
| `backoffice-dashboard-display` | Backoffice Dashboard | backoffice | P2 | staff | `/backoffice` |
| `backoffice-order-management` | Order Management | backoffice | P2 | staff | `/backoffice/pedidos` |
| `backoffice-order-filter` | Filter Backoffice Orders by Status | backoffice | P2 | staff | `/backoffice/pedidos` |
| `backoffice-order-pagination` | Paginate Backoffice Orders | backoffice | P2 | staff | `/backoffice/pedidos` |
| `backoffice-peluch-list` | Peluch List | backoffice | P3 | staff | `/backoffice/peluches` |
| `backoffice-peluch-create` | Create Peluch | backoffice | P3 | staff | `/backoffice/peluches/nuevo` |
| `backoffice-peluch-edit` | Edit Peluch | backoffice | P3 | staff | `/backoffice/peluches/[slug]` |
| `backoffice-category-management` | Category Management | backoffice | P3 | staff | `/backoffice/categorias` |
| `backoffice-user-management` | User Management | backoffice | P3 | staff | `/backoffice/usuarios` |
| `contact-page-display` | Contact Page | public | P4 | shared | `/contact` |
| `about-page-display` | About Page | public | P4 | shared | `/about` |
| `terms-page-display` | Terms Page | public | P4 | shared | `/terms` |
| `catalog-filter-by-size` | Filter Catalog by Size | catalog | P2 | shared | `/catalog` |
| `catalog-filter-by-price` | Filter Catalog by Max Price | catalog | P3 | shared | `/catalog` |
| `catalog-filter-personalization` | Filter Catalog by Huella | catalog | P3 | shared | `/catalog` |
| `catalog-pagination` | Paginate Catalog Grid | catalog | P3 | shared | `/catalog` |
| `orders-filter-by-status` | Filter My Orders by Status | orders | P2 | user | `/orders` |
| `orders-search-by-number` | Search My Orders by Number | orders | P3 | user | `/orders` |
| `auth-resend-verification-code` | Resend Sign-up Verification Code | auth | P3 | guest | `/sign-up` |
| `auth-forgot-password-resend` | Resend Forgot-Password Code | auth | P3 | guest | `/forgot-password` |
| `payment-card-submit` | Pay with Card | payment | P1 | shared | `/payment` |
| `payment-nequi-submit` | Pay with Nequi | payment | P1 | shared | `/payment` |
| `payment-pse-submit` | Pay with PSE | payment | P2 | shared | `/payment` |
| `payment-pse-legal-entity-nit` | PSE legal entity requires NIT | payment | P2 | shared | `/payment` |
| `payment-bancolombia-submit` | Pay with Bancolombia | payment | P2 | shared | `/payment` |
| `backoffice-analytics-date-filter` | Filter Analytics by Date Range | backoffice | P3 | staff | `/backoffice` |
| `backoffice-analytics-export-csv` | Export Orders CSV | backoffice | P3 | staff | `/backoffice` |
| `backoffice-peluch-toggle-featured` | Toggle Peluch Featured | backoffice | P3 | staff | `/backoffice/peluches` |
| `backoffice-peluch-delete` | Delete Peluch | backoffice | P3 | staff | `/backoffice/peluches` |
| `backoffice-peluch-bulk-category` | Bulk Assign Category to Peluches | backoffice | P3 | staff | `/backoffice/peluches` |
| `backoffice-category-create` | Create Category | backoffice | P3 | staff | `/backoffice/categorias` |
| `backoffice-category-edit` | Edit Category | backoffice | P3 | staff | `/backoffice/categorias` |
| `backoffice-category-delete` | Delete Category | backoffice | P3 | staff | `/backoffice/categorias` |
| `backoffice-user-toggle-role` | Toggle User Role | backoffice | P3 | staff | `/backoffice/usuarios` |
| `backoffice-user-toggle-active` | Toggle User Active State | backoffice | P3 | staff | `/backoffice/usuarios` |
| `backoffice-order-status-update` | Update Order Status | backoffice | P2 | staff | `/backoffice/pedidos` |
| `backoffice-order-tracking-update` | Set Order Tracking Number | backoffice | P3 | staff | `/backoffice/pedidos` |
| `backoffice-promo-banner-save` | Save Promo Banner | backoffice | P3 | staff | `/backoffice/configuracion` |
| `backoffice-hero-image-upload` | Upload Hero Image | backoffice | P3 | staff | `/backoffice/configuracion` |
| `backoffice-peluch-create-draft-on-color-upload` | Draft Auto-Created on First Color Upload | backoffice | P2 | staff | `/backoffice/peluches/nuevo` |
| `backoffice-peluch-color-upload-per-image-status` | Per-Image Upload Status with Retry | backoffice | P2 | staff | `/backoffice/peluches/nuevo` |
| `backoffice-peluch-create-cancel-discards-draft` | Cancel Discards Draft | backoffice | P2 | staff | `/backoffice/peluches/nuevo` |
| `backoffice-peluch-list-draft-badge` | Draft Badge on Peluch List | backoffice | P2 | staff | `/backoffice/peluches` |

---

## Auth Module

### auth-sign-in

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Roles | guest |
| Ruta | `/sign-in` |
| API | `POST /api/sign_in/` |

La cuenta debe estar activa y tener el correo verificado. El visitante completa correo, contraseña y CAPTCHA cuando está configurado. El éxito guarda la sesión y abre `/orders` o `/backoffice` según el rol.

| Condición | Resultado |
|---|---|
| Credenciales incorrectas | 401; mensaje en el formulario |
| CAPTCHA ausente o rechazado | 400; no abre sesión |
| Cuenta bloqueada | 403; contactar al equipo, sin ofrecer verificación |
| Correo pendiente en cuenta activa | 403 con `needs_verification`; permite continuar a verificar |

---

### auth-sign-up

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Roles | guest |
| Ruta | `/sign-up` |
| API | `POST /api/sign_up/` |

1. El visitante completa nombre, apellido, correo y contraseña, acepta los términos y resuelve CAPTCHA cuando corresponde.
2. El formulario valida confirmación y longitud de la contraseña antes de enviar.
3. El servidor crea una cuenta con `is_active=True` y `email_verified=False`, y un código con propósito `registration`.
4. La interfaz muestra la verificación; el registro todavía no entrega tokens ni abre una sesión.

La cuenta ya verificada o bloqueada rechaza un nuevo registro. Una cuenta activa con correo pendiente puede recibir otro código de registro. Los errores de validación o CAPTCHA se muestran en el formulario.

---

### auth-google-login

El registro declara este flujo como exento (`expectedSpecs=0`). La interfaz actual no inicia una autenticación Google funcional. Esta ronda no incorpora un proveedor OAuth ni cuenta su superficie visual como autenticación probada.

---

### auth-forgot-password

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/forgot-password` |
| **API endpoints** | `POST /api/send_passcode/`, `POST /api/verify_passcode_and_reset_password/` |

**Preconditions:** User is not authenticated. A registered account exists.

**Step A — Request passcode:**

1. User navigates to `/forgot-password`.
2. Page renders email input and **Send verification code** button (step = `email`).
3. User enters email and clicks **Send verification code**.
4. Frontend sends `POST /api/send_passcode/` with `{ email }`.
5. Backend generates a `PasswordCode`, sends email with 6-digit code.
6. Success message: "Verification code sent to your email". UI transitions to step = `code`.

**Step B — Reset password:**

7. Page renders **Code** (6-digit), **New Password**, **Confirm New Password** fields and **Reset password** button.
8. User enters code and new password.
9. Frontend validates passwords match and length >= 8.
10. Frontend sends `POST /api/verify_passcode_and_reset_password/` with `{ email, code, new_password }`.
11. Backend verifies code, updates password, marks code as used. Returns HTTP 200.
12. Success message: "Password reset successfully! Redirecting..." — redirect to `/sign-in`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Email not registered | API still returns `200 { message: "If the email exists, a code has been sent" }` (no leak) |
| Email send failure | `500 { error: "Failed to send email" }` |
| Invalid or expired code | `400 { error: "Invalid or expired code" }` |
| Passwords do not match | Client error — no API call |
| Password < 8 chars | Client error — no API call |
| "Back to email" clicked | UI returns to step A |

---

### auth-login-success

**Roles:** guest. **Ruta:** `/sign-in`. **API:** `POST /api/sign_in/`.

Una cuenta activa y con correo verificado completa credenciales y CAPTCHA configurado. El navegador guarda los tokens, restaura al usuario y llega a pedidos o backoffice según el rol. Una cuenta bloqueada o con correo pendiente no cumple esta precondición.

---

### auth-registration-verify

**Roles:** guest. **Ruta:** `/sign-up` en el paso de verificación. **API:** `POST /api/verify_registration/`.

1. El visitante introduce el código de registro recibido por correo.
2. El servidor comprueba cuenta activa, correo pendiente, propósito `registration`, caducidad y uso previo bajo bloqueo transaccional.
3. El éxito marca sólo el correo como verificado, consume el código, abre la sesión y muestra los pedidos.

Un código incorrecto, vencido, utilizado o de recuperación de contraseña rechaza la operación sin abrir sesión. Una cuenta bloqueada no se reactiva. Dos solicitudes simultáneas sólo pueden consumir el código una vez.

---

### auth-sign-out

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | user |
| **Frontend route** | `/dashboard` |
| **API endpoints** | None (client-side only) |

**Preconditions:** User is authenticated.

**Steps:**

1. User is on `/dashboard`.
2. User clicks **Sign out** button.
3. Frontend clears JWT tokens from cookies via `authStore.signOut()`.
4. User is redirected to `/sign-in` (or home) by the auth guard.

**Branching conditions:** None — sign-out is always client-side.

---

### auth-session-persistence

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | user |
| **Frontend route** | any protected route |
| **API endpoints** | `GET /api/validate_token/`, `POST /api/token/refresh/` |

**Preconditions:** User has valid tokens in cookies.

**Steps:**

1. User navigates to a protected route (`/dashboard`, `/backoffice`).
2. Frontend reads `access_token` from cookies.
3. Frontend sends `GET /api/validate_token/` with Bearer token.
4. Backend validates JWT and returns `{ valid: true, user: { id, email, first_name, last_name, role, is_staff } }`.
5. User is shown the protected content.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| No tokens in cookies | Redirect to `/sign-in` via `useRequireAuth` hook |
| Access token expired | Frontend calls `POST /api/token/refresh/` with refresh token |
| Refresh token expired | Redirect to `/sign-in` |

---

## Public Module

### public-home

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/` |
| **API endpoints** | `GET /api/peluches/featured/` |

**Preconditions:** None.

**Steps:**

1. User navigates to `/`.
2. Page renders hero section with heading "Cada abrazo guarda un recuerdo único."
3. CTA links: **Explorar catálogo** (→ `/catalog`), **Ver catálogo completo** (→ `/catalog`).
4. Featured peluches carousel loads from `GET /api/peluches/featured/`.
5. Category grid, testimonials, and FAQ sections rendered statically.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Featured API unavailable | Carousel shows empty state |

---

### public-navigation

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | guest |
| **Frontend route** | all pages |
| **API endpoints** | None |

**Preconditions:** None.

**Steps:**

1. Every page renders a shared header with navigation links.
2. Header contains links to: Home (`/`), Catalog (`/catalog`), Blogs (`/blogs`), Sign-in (`/sign-in`).
3. Footer is present on all pages.
4. Navigation links work across page transitions.
5. Browser back/forward buttons maintain correct history.

**Branching conditions:** None — purely structural.

---

### public-catalog-browse

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/catalog` |
| **API endpoints** | `GET /api/peluches/`, `GET /api/categories/`, `GET /api/sizes/` |

**Preconditions:** None.

**Steps:**

1. User navigates to `/catalog`.
2. Page fetches categories and sizes for filter sidebar.
3. Frontend fetches `GET /api/peluches/` with optional query params (category, size, min_price, max_price, sort).
4. Peluches render as a grid of `ProductCard` components (gallery_urls[0], title, min_price, badge, available_colors).
5. Each card links to `/peluches/[slug]`.
6. Changing filter controls re-fetches the list.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| API loading | Skeleton grid shown |
| API error | Error state with retry option |
| No peluches match filters | Empty state message |

---

### public-peluch-detail

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | `GET /api/peluches/[slug]/`, `GET /api/peluches/[slug]/reviews/` |

**Preconditions:** Peluch with given slug exists.

**Steps:**

1. User navigates to `/peluches/[slug]`.
2. Page shows "Cargando..." while fetching.
3. Frontend fetches `peluchService.getPeluchBySlug(slug)`.
4. Page renders: gallery, title, lead_description, badge, rating.
5. Size selector from `size_prices`; price updates on selection.
6. Color selector from `available_colors`.
7. Personalization sections shown conditionally: Huella (if `has_huella`), Corazón (if `has_corazon`), Audio (if `has_audio`).
8. Total price = `size_price + personalization_costs`.
9. **Agregar** button adds `CartItem` to cart store.
10. Tabs: Descripción, Especificaciones, Cuidados.
11. Reviews loaded from `getReviews(slug)`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Slug not found | Shows "No encontramos este peluche." |
| No size selected | Agregar button disabled |
| No color selected | Agregar button disabled |

---

### public-blogs-browse

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | guest |
| **Frontend route** | `/blogs` |
| **API endpoints** | `GET /api/blogs-data/` |

**Preconditions:** None.

**Steps:**

1. User navigates to `/blogs`.
2. Page displays heading "Blogs" with loading skeleton.
3. Frontend fetches `GET /api/blogs-data/` via `blogStore.fetchBlogs()`.
4. Blogs render as a grid of `BlogCard` components.
5. Each card links to `/blogs/[blogId]`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| API loading | Skeleton grid (9 placeholders) shown |
| API error | "Blogs unavailable" message with **Retry** button |
| No blogs in DB | "No blogs yet" dashed-border message |

---

### public-blog-detail

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | guest |
| **Frontend route** | `/blogs/[blogId]` |
| **API endpoints** | `GET /api/blogs-data/[blogId]/` |

**Preconditions:** Blog with given ID exists.

**Steps:**

1. User navigates to `/blogs/[blogId]`.
2. Frontend fetches blog detail data.
3. Page renders blog title, content, and associated media.
4. User can navigate back to `/blogs` via browser back button.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Blog not found | Loading state or fallback |

---

## App Module

### app-cart-add

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | guest |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | None (client-side state via Zustand + localStorage) |

**Preconditions:** User is on a peluch detail page with a size and color selected.

**Steps:**

1. User views a peluch on `/peluches/[slug]`.
2. User selects size and color.
3. User clicks **Agregar** button.
4. `cartStore.addToCart(cartItem)` adds a `CartItem` keyed by `peluch_id+size_id+color_id`.
5. Cart state persists to `localStorage`.
6. User can navigate to `/cart` to see the item.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Same peluch+size+color already in cart | Quantity incremented |
| Same peluch but different size or color | New separate entry added |

---

### app-cart-manage

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | guest |
| **Frontend route** | `/cart` |
| **API endpoints** | None (client-side state) |

**Preconditions:** User has at least one item in cart.

**Steps:**

1. User navigates to `/cart`.
2. Cart displays each item: image, title, size/color, decrement/increment controls, **Eliminar** button, and line total.
3. **Update quantity:** User clicks **+** or **−**; `cartStore.updateQuantity(key, qty)` recalculates the line and subtotal.
4. **Remove item:** User clicks **Eliminar** → `cartStore.removeFromCart(key)`.
5. **Subtotal** recalculates: `sum of (unit_price + personalization_cost) * quantity` per item.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Cart is empty | "Tu carrito está vacío." message |
| Single item removed | If last item, shows empty cart message |
| User decrements quantity at one | Quantity remains one; removal uses the separate **Eliminar** control |

---

### app-cart-persistence

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/cart` |
| **API endpoints** | None |

**Preconditions:** User has items in cart.

**Steps:**

1. User adds products to cart (see `app-cart-add`).
2. User reloads the page or navigates away and returns.
3. Cart state is restored from `localStorage` via Zustand persist middleware.
4. All items, quantities, and subtotal remain intact.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| localStorage cleared | Cart resets to empty |
| Corrupt localStorage data | Cart may reset to empty (Zustand default) |

---

### checkout-wompi-redirect

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | shared |
| **Frontend route** | `/checkout` |
| **API endpoints** | `POST /api/orders/` |

After valid checkout, the API returns the order number, totals, guest flag,
`order_access_token` and `expires_at`. The browser stores access before
navigating to payment. Later private requests send it as `X-Order-Access`.

| Condition | Behavior |
|-----------|----------|
| Created | Store capability, then navigate to `/payment?order=...` |
| Inaccessible personalization | Identify the affected line, preserve cart and offer **Volver a personalizar** |
| Reupload | Preserve product, size, color and quantity before resubmitting |
| Other API failure | Generic error; cart retained |

---

### app-dashboard

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | user |
| **Frontend route** | `/dashboard` |
| **API endpoints** | `GET /api/validate_token/` (via auth guard) |

**Preconditions:** User is authenticated with valid JWT.

**Steps:**

1. User navigates to `/dashboard`.
2. `useRequireAuth()` hook validates the token.
3. If authenticated, page renders: heading "Dashboard", link to **Backoffice**, **Sign out** button.
4. User can click **Backoffice** to navigate to `/backoffice`.
5. User can click **Sign out** to clear session (see `auth-sign-out`).

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Not authenticated | Redirect to `/sign-in` |
| Token expired | Attempt refresh; if fail, redirect to `/sign-in` |

---

## Backoffice Module

### backoffice-users-list

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice` |
| **API endpoints** | `GET /api/users/` |

**Preconditions:** User is authenticated with `is_staff = true`.

**Steps:**

1. User navigates to `/backoffice`.
2. `useRequireAuth()` hook validates the token.
3. Frontend fetches `GET /api/users/` with Bearer token.
4. Users table renders columns: **Email**, **Role**, **Staff**, **Active**.
5. Each row shows user data.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Not authenticated | Redirect to `/sign-in` |
| Not staff | `403` error — "Could not load backoffice data. Make sure you are signed in with a staff user." |
| No users | "No data" row shown |

---

### backoffice-orders-list

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice` |
| **API endpoints** | `GET /api/orders/list/` |

**Preconditions:** User is authenticated with `is_staff = true`.

**Steps:**

1. User navigates to `/backoffice`.
2. Frontend fetches `GET /api/orders/list/` with Bearer token.
3. Orders table renders: **order_number**, **customer_name**, **status** (badge), **total_amount**, **deposit_amount**, **created_at**.
4. Admin can change order status via dropdown → `PATCH /api/orders/[number]/status/`.
5. Admin can enter tracking number → `PATCH /api/orders/[number]/tracking/`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Not staff | `403` error |
| No orders | "No data" row shown |

---

## App Module — Peluchelandia Extensions

### app-peluch-size-color

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | None (data from peluch detail response) |

**Steps:**

1. User is on peluch detail page.
2. User clicks a size button from `size_prices` → price updates to that size's price.
3. User clicks a color swatch from `available_colors`.
4. Total price display updates immediately.

---

### app-peluch-huella

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | `POST /api/media/upload/` for image type |

When the product supports huella, the visitor selects a type and supplies text
or an image. Image upload returns `media_id` and `media_token`; both are stored
on the cart line for checkout. Upload validation/server errors remain visible.
The per-product huella cost is retained.

---

### app-peluch-corazon

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | None |

**Preconditions:** Peluch has `has_corazon = true`.

**Steps:**

1. Corazón section rendered with `corazon_extra_cost` shown.
2. User enters a phrase (max 50 characters).
3. `personalization_cost` increases by `corazon_extra_cost`.

---

### app-orders-list

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | user |
| **Frontend route** | `/orders` |
| **API endpoints** | `GET /api/orders/my/` |

**Preconditions:** User is authenticated.

**Steps:**

1. User navigates to `/orders`.
2. If not authenticated → redirect to `/sign-in`.
3. Frontend fetches `GET /api/orders/my/`.
4. Orders render as expandable cards: order_number, status badge, total_amount, created_at.
5. Expanding card shows items with title, size, color, quantity, line_total.

**Status badge mapping:**

| Status | Label | Color |
|--------|-------|-------|
| `pending_payment` | Pendiente de pago | yellow |
| `payment_confirmed` | Pago confirmado | blue |
| `in_production` | En producción | purple |
| `shipped` | Despachado | orange |
| `delivered` | Entregado | green |
| `cancelled` | Cancelado | red |

---

### app-tracking

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/tracking` |
| **API endpoints** | `GET /api/orders/track/[order_number]/`, `POST /api/orders/[order_number]/access/request/`, `access/verify/` |

1. Enter the order number and click **Buscar**.
2. Request the private timeline with stored per-order capability or owner session.
3. Authorized requests render the timeline and order details.
4. Missing, invalid or expired access shows **Accede a tu pedido**, without order data.
5. Enter the purchase email and click **Enviar código**; acknowledgement is generic.
6. Enter the six-digit code and click **Verificar código**.
7. Valid single-use code stores thirty-day access and reloads the timeline.

| Condition | Behavior |
|-----------|----------|
| Invalid/expired/used/mismatched/rate-limited code | Same generic verification error |
| Browser storage unavailable | Access remains usable in the current page session |
| Unrelated tracking failure | Generic tracking error |
| Authorized | Timeline, shipping details, items and payment status render |

---

### app-tracking-wompi

Tracking links use `/tracking?order=<number>#access=<token>`. The browser
stores the token and removes the fragment with `history.replaceState` before
recording the page view. It then automatically loads the private timeline.
Expired or absent capabilities open the same email-code recovery flow.

---

## Payment Module

### payment-page-display

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | shared |
| **Frontend route** | `/payment?order=<number>` |
| **API endpoints** | `GET /api/payment/info/[order_number]/`, access request/verify |

Payment first loads private order totals with `X-Order-Access` or an authorized
owner/staff session. Only then are provider acceptance tokens and payment
methods loaded. Missing/expired access opens the shared email-code recovery
form. Unrelated load failure retains retry; no order selected gives a cart link.
Method-specific validation and provider failures remain visible.

---

### order-confirmed-display

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | shared |
| **Frontend route** | `/order-confirmed?order=<number>` |
| **API endpoints** | `GET /api/payment/info/[order_number]/`, `GET /api/payment/check/[order_number]/` |

Private payment information must load successfully before showing its state.
Missing/expired access opens email-code recovery; transient failure retains
retry. The cart clears only after an authorized approved result. A URL flag
such as `confirmed=1` cannot confirm payment or clear the cart. A later access
denial stops further status checks and returns to recovery.

---

## Reviews Module

### review-display

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | `GET /api/peluches/{slug}/reviews/` |

1. The visitor enters a peluch detail through the catalog.
2. The page loads approved public reviews and displays each reviewer name, rating, and comment.
3. A guest can read the reviews and receives **Iniciar sesión** instead of submission controls.
4. For an authenticated visitor, `is_mine` marks an existing own review; the page keeps that review visible and hides the duplicate submission form.

| Condition | Behavior |
|-----------|----------|
| No approved reviews | No review cards are rendered. |
| Guest visitor | Public reviews remain visible and the page offers **Iniciar sesión**. |
| `is_mine` review | Existing own review remains visible; **Deja tu reseña** and **Publicar reseña** are absent. |
| Authenticated visitor without an own review | The submission path belongs to `review-submit`. |

### review-submit

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | user |
| **Frontend route** | `/peluches/[slug]` |
| **API endpoints** | `POST /api/peluches/{slug}/reviews/` |

**Preconditions:** User is authenticated. User has a delivered order containing this peluch.

**Steps:**

1. User navigates to `/peluches/[slug]`.
2. Reviews section is visible below product details.
3. Authenticated user sees a **Write a review** form: star rating (1–5) and comment textarea.
4. User selects rating and enters comment.
5. User clicks **Submit**.
6. Frontend sends `POST /api/peluches/{slug}/reviews/` with `{ rating, comment, order_id? }`.
7. Backend validates user has a delivered order for this peluch and creates review (is_approved = false).
8. Success message: "Tu reseña ha sido enviada y está pendiente de aprobación."

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Not authenticated | Review form not shown; prompt to sign in |
| No delivered order | `403` — "Solo puedes reseñar productos que hayas recibido" |
| Review already submitted | `400 { error: "Ya enviaste una reseña para este producto" }` |
| Comment too short | Client-side validation before submission |

---

## Backoffice Module (Extended)

### backoffice-login

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/sign-in` |
| **API endpoints** | `POST /api/sign_in/` |

**Preconditions:** User has a staff account (`is_staff = true`).

**Steps:**

1. User navigates to `/sign-in`.
2. Page renders email and password form.
3. User enters credentials and clicks **Sign in**.
4. Frontend sends `POST /api/sign_in/` → backend returns tokens plus the staff user.
5. Frontend stores tokens and redirects to `/backoffice`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Invalid credentials | `401` error shown below form |
| Valid non-staff user | Redirects to `/orders` |

---

### backoffice-dashboard-display

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice` |
| **API endpoints** | `GET /api/analytics/dashboard/`, `GET /api/orders/list/`, `GET /api/users/` |

**Preconditions:** User is authenticated with `is_staff = true`.

**Steps:**

1. User navigates to `/backoffice`.
2. `useRequireAuth()` validates token.
3. Frontend fetches analytics dashboard data.
4. Dashboard renders KPI widgets: total orders, revenue, top peluches, device types, traffic sources.
5. Admin sidebar allows navigation to orders, peluches, categories, and users sections.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Not staff | `403` — "Make sure you are signed in with a staff user." |
| Not authenticated | Redirect to `/sign-in` |

---

### backoffice-order-management

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/pedidos` |
| **API endpoints** | `GET /api/orders/list/?page=<n>&page_size=100`, `PATCH /api/orders/{number}/status/`, `PATCH /api/orders/{number}/tracking/` |

**Preconditions:** User is authenticated with `is_staff = true`.

**Steps:**

1. User navigates to `/backoffice/pedidos`.
2. El frontend consulta `GET /api/orders/list/?page=1&page_size=100`.
3. La tabla muestra las filas de esa página, el total del servidor y `Página 1 de N`.
4. Staff clicks a status dropdown on a row → `PATCH /api/orders/{number}/status/` updates the status.
5. Staff enters a tracking number → `PATCH /api/orders/{number}/tracking/` saves carrier + guide.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| No orders | `Sin pedidos` después de una respuesta vacía |
| Status update fails | Error toast |

---

### backoffice-peluch-list

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches` |
| **API endpoints** | `GET /api/peluches/` |

**Steps:**

1. User navigates to `/backoffice/peluches`.
2. Frontend fetches all peluches via `peluchAdminService.listAll()`.
3. Table shows: title, category, is_active, is_featured, display_order.
4. **Nuevo** button links to `/backoffice/peluches/nuevo`.
5. Clicking a row links to `/backoffice/peluches/[slug]`.

---

### backoffice-peluch-create

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches/nuevo` |
| **API endpoints** | `POST /api/peluches/`, `POST /api/peluches/{slug}/color-image/{color}/`, `POST /api/peluches/{slug}/gallery/` |

**Steps:**

1. Staff navigates to `/backoffice/peluches/nuevo`.
2. `PeluchForm` renders all fields: title, slug, category, lead_description, description (JSON), specifications (JSON), size_prices, available_colors, personalization toggles, etc.
3. Staff fills form and clicks **Guardar**.
4. Frontend sends `POST /api/peluches/` → peluch created.
5. Staff may upload gallery images and color images in subsequent steps.
6. On success, redirect to `/backoffice/peluches`.

---

### backoffice-peluch-edit

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches/[slug]` |
| **API endpoints** | `GET /api/peluches/{slug}/`, `PATCH /api/peluches/{slug}/`, gallery/color-image endpoints |

**Steps:**

1. Staff navigates to `/backoffice/peluches/[slug]`.
2. Page fetches existing peluch data and pre-fills `PeluchForm`.
3. Staff edits fields and clicks **Guardar**.
4. Frontend sends `PATCH /api/peluches/{slug}/` with changed fields.
5. Staff can upload/delete gallery images and color-specific images.

---

### backoffice-category-management

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/categorias` |
| **API endpoints** | `POST /api/categories/`, `PATCH /api/categories/{id}/`, `DELETE /api/categories/{id}/` |

**Steps:**

1. Staff navigates to `/backoffice/categorias`.
2. Frontend fetches `GET /api/categories/` and renders categories in a table.
3. **Create:** Staff fills name/slug/description and clicks **Crear** → `POST /api/categories/`.
4. **Edit:** Staff changes fields inline and confirms → `PATCH /api/categories/{id}/`.
5. **Delete:** Staff clicks delete icon and confirms → `DELETE /api/categories/{id}/`.

---

### backoffice-user-management

**Roles:** staff. **Ruta:** `/backoffice/usuarios`. **API:** `GET /api/users/`.

El staff abre Usuarios desde el menú del backoffice y ve una fila por usuario. La columna Estado distingue:

| Estado de la cuenta | Texto |
|---|---|
| `is_active=False` | Inactivo |
| Activa, `email_verified=False` | Correo pendiente |
| Activa, `email_verified=True` | Activo |

El bloqueo administrativo tiene precedencia sobre la verificación. La verificación es un dato de sólo lectura.

---

## Public Module (Extended)

### contact-page-display

| Field | Value |
|-------|-------|
| **Priority** | P4 |
| **Roles** | shared |
| **Frontend route** | `/contact` |
| **API endpoints** | `GET /api/content/contact_info/` (optional) |

**Steps:**

1. User navigates to `/contact`.
2. Page renders contact information or a contact form.
3. Content may be loaded from `contentService.get('contact_info')`.

---

### about-page-display

| Field | Value |
|-------|-------|
| **Priority** | P4 |
| **Roles** | shared |
| **Frontend route** | `/about` |
| **API endpoints** | `GET /api/content/history/` (optional) |

**Steps:**

1. User navigates to `/about`.
2. Page renders brand history, artisan story, and values.
3. Content may be loaded from `contentService.get('history')`.

---

### terms-page-display

| Field | Value |
|-------|-------|
| **Priority** | P4 |
| **Roles** | shared |
| **Frontend route** | `/terms` |
| **API endpoints** | `GET /api/content/terms/` (optional) |

**Steps:**

1. User navigates to `/terms`.
2. Page renders terms and conditions content.
3. Content may be loaded from `contentService.get('terms')`.

---

## Cross-Reference

| Artifact | Path | Purpose |
|----------|------|---------|
| Flow Definitions (JSON) | `e2e/flow-definitions.json` | Machine-readable flow registry for the E2E reporter |
| Flow Tag Constants | `e2e/helpers/flow-tags.ts` | Reusable tag arrays for Playwright tests |
| E2E Spec Files | `e2e/<module>/*.spec.ts` | Playwright test implementations per module |
| Flow Coverage Report | `e2e-results/flow-coverage.json` | Auto-generated coverage status per flow |
| Architecture Standard | `docs/DJANGO_REACT_ARCHITECTURE_STANDARD.md` | Sections 3.7.5–3.7.10 define the flow methodology |
| E2E Flow Coverage Standard | `docs/E2E_FLOW_COVERAGE_REPORT_STANDARD.md` | Reporter implementation and JSON schema |

### Maintenance Rules

- **Adding a new flow:** Add entry here with full steps/branches, then add to `e2e/flow-definitions.json`, then create E2E tests.
- **Modifying a flow:** Update steps and branches in this document first, then update tests accordingly.
- **Removing a flow:** Remove from this document, `e2e/flow-definitions.json`, and all `@flow:` tags in specs.
- **Bump `Version` and `Last Updated`** on every change.

---

## Flows added in version 1.3.0 (2026-05-01)

### auth-forgot-password-submit

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | guest |
| **Frontend route** | `/forgot-password` |
| **API endpoints** | `POST /api/send_passcode/`, `POST /api/verify_passcode_and_reset_password/` |

Covers the full reset path beyond the form-display check captured by `auth-forgot-password-form`. User enters email, receives a passcode, then submits passcode + new password. On success the page transitions to the `done` step and shows "¡Contraseña actualizada!". Invalid-passcode response (400) keeps the user on step `reset` and renders the backend error message; passwords-mismatch and password-length client validations are out of scope here (see `auth-forgot-password` for the full branching matrix).

### catalog-filter-by-category

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/catalog` |
| **API endpoints** | `GET /api/categories/`, `GET /api/peluches/?category=<slug>` |

User lands on `/catalog`, sees all peluches, then clicks a category label in the filter sidebar. The list re-renders showing only peluches whose `category_slug` matches. Clicking the same label again toggles back to "Todos". Mobile devices show a "Mostrar filtros" toggle that exposes the same panel.

### catalog-sort-products

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | shared |
| **Frontend route** | `/catalog` |
| **API endpoints** | `GET /api/peluches/?sort=<value>` |

User changes the sort dropdown (`<select>` with options `popular`, `new`, `price_asc`, `price_desc`, `top_rated`). The state change triggers a re-fetch with the new `sort` param; the backend returns the list in the requested order. Other active filters (category, size, price, has_huella) are preserved in the same request.

### backoffice-site-configuration

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/configuracion` |
| **API endpoints** | `GET/PUT /api/content/promo_banner/`, `GET /api/content/hero_image/`, `POST /api/content/hero-image/upload/` |

Staff opens the site-configuration page, edits the promo banner (toggle active, message, background/text color), and clicks "Guardar cinta" — frontend calls `PUT /api/content/promo_banner/` with the new `content_json`. Button label transitions Guardar → Guardando… → ✓ Guardado (auto-resets after 3s). Hero-image upload uses a separate multipart `POST` and updates the preview on success.

---

## Flows added in version 1.4.0 (2026-05-01)

These flows were registered after a `/e2e-user-flows-check full` audit confirmed each interaction exists in `frontend/app/` but had no entry in the registry. Existing umbrella flows (`payment-page-display`, `backoffice-category-management`, `backoffice-user-management`, `backoffice-order-management`, `backoffice-site-configuration`) remain in place; the new flows below are additive splits that cover specific user actions for finer-grained coverage signals.

### catalog-filter-by-size

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/catalog` |
| **API endpoints** | `GET /api/peluches/?size=<slug>` |

User toggles a size pill in the `/catalog` sidebar. The active size becomes part of the filter state and the product list re-fetches with `?size=<slug>` so only matching peluches are rendered. Clicking the same size again clears the filter (toggle behavior).

### catalog-filter-by-price

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | shared |
| **Frontend route** | `/catalog` |
| **API endpoints** | `GET /api/peluches/?max_price=<n>` |

User drags the max-price slider on `/catalog` (range 60k–250k COP). The displayed price updates immediately and the list re-fetches after the final value settles, excluding peluches whose minimum price exceeds the threshold. At the maximum 250000 COP, no `max_price` param is sent.

### catalog-filter-personalization

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | shared |
| **Frontend route** | `/catalog` |
| **API endpoints** | `GET /api/peluches/?has_huella=true` |

User toggles the "con huella" checkbox in the catalog filter sidebar. When active, the product list re-fetches with `?has_huella=true` and only peluches whose `has_huella` flag is true are shown.

### catalog-pagination

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | shared |
| **Frontend route** | `/catalog` |
| **API endpoints** | None (client-side slicing of the already-fetched list) |

When the catalog returns more products than the responsive page size (16 on desktop ≥1024px, 12 on mobile), a pagination nav appears below the grid with Anterior/Siguiente buttons and numbered pages. Clicking a page swaps the visible cards and scrolls back to the top. Changing any filter or the sort order resets to page 1. With results that fit on one page, no pagination controls are rendered.

### orders-filter-by-status

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | user |
| **Frontend route** | `/orders` |
| **API endpoints** | None (client-side filter on already-fetched list) |

Authenticated user clicks one of the status filter buttons on `/orders` (Todos / Pendiente pago / Pago confirmado / En producción / Despachado / Entregado / Cancelado). The visible orders narrow to those matching the selected status. "Todos" clears the filter.

### orders-search-by-number

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | user |
| **Frontend route** | `/orders` |
| **API endpoints** | None (client-side filter) |

Authenticated user types into the "Buscar por # pedido…" input on `/orders`. The list filters in-memory by case-insensitive substring match on `order_number` or `customer_name`. Combines with the active status filter.

### auth-resend-verification-code

**Roles:** guest con una cuenta activa y correo pendiente. **API:** `POST /api/resend_verification/`.

El botón accesible «Reenviar código» vuelve a estar disponible tras el contador inicial de 60 segundos. El éxito solicita otro código con propósito `registration` y reinicia el contador. Una cuenta bloqueada o ya verificada no recibe un código de registro. Un fallo no abre sesión ni verifica la cuenta.

---

### auth-forgot-password-resend

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | guest |
| **Frontend route** | `/forgot-password` |
| **API endpoints** | `POST /api/send_passcode/` |

During step 2 of `/forgot-password` (passcode entry), the user clicks "Reenviar código" once the cooldown expires. Frontend re-calls `POST /api/send_passcode/` with the same email; backend issues a new code. The cooldown restarts.

### payment-card-submit

Private process sends X-Order-Access; an access denial clears the stale capability and opens email-code recovery.

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | shared |
| **Frontend route** | `/payment` |
| **API endpoints** | `POST /api/payment/process/` (via `paymentService.processCard`) |

User selects the **Tarjeta** tab on `/payment`, fills card number (formatted), cardholder name, expiry (MM/YY), and CVV. On submit, `paymentService.processCard` tokenizes the card via Wompi and confirms the transaction. On success the user navigates to `/order-confirmed?order=...&confirmed=1`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Card declined | Error message rendered; user stays on `/payment` |
| Tokenization failure | Error toast; submit re-enabled |

### payment-nequi-submit

Private process sends X-Order-Access; an access denial clears the stale capability and opens email-code recovery.

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Roles** | shared |
| **Frontend route** | `/payment` |
| **API endpoints** | `POST /api/payment/process/` (via `paymentService.processNequi`) |

User selects the **Nequi** tab on `/payment`, enters the 10-digit Colombian phone number, and submits. `paymentService.processNequi` triggers a push notification to the user's phone for approval. On success navigates to `/order-confirmed`.

### payment-pse-submit

Private process sends X-Order-Access; an access denial clears the stale capability and opens email-code recovery.

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/payment` |
| **API endpoints** | `GET /api/payment/pse-banks/`, `POST /api/payment/process/` (via `paymentService.processPse`) |

User selects the **PSE** tab on `/payment`. The bank dropdown is populated from `GET /api/payment/pse-banks/`. User picks bank, person type (Natural/Jurídica), ID type and ID number, then submits. The ID type options depend on the person type: **Natural → CC/CE**, **Jurídica → NIT only** (see `payment-pse-legal-entity-nit`). `paymentService.processPse` returns a `redirect_url`; the browser navigates to the bank portal where the customer authenticates and authorizes the payment.

### payment-pse-legal-entity-nit

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/payment` |
| **API endpoints** | `POST /api/payment/process/` (via `paymentService.processPse`) |

On the **PSE** tab, when the user selects **Jurídica** (legal entity) as person type, the document-type selector is restricted to **NIT** only; selecting **Natural** offers **CC/CE**. The backend (`process_payment`, PSE branch) defensively rejects `user_type=1` with a document type other than `NIT` (HTTP 400). A legal entity in Colombia is identified by its NIT.

### payment-bancolombia-submit

Private process sends X-Order-Access; an access denial clears the stale capability and opens email-code recovery.

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | shared |
| **Frontend route** | `/payment` |
| **API endpoints** | `POST /api/payment/process/` (via `paymentService.processBancolombia`) |

User selects the **Bancolombia** tab on `/payment`, picks person type and ID type/number, and submits. `paymentService.processBancolombia` returns a `redirect_url`; the browser navigates to Bancolombia for transfer authorization.

### backoffice-analytics-date-filter

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice` |
| **API endpoints** | `GET /api/analytics/dashboard/?from=<date>&to=<date>` |

Staff sets the `dateFrom` and `dateTo` inputs at the top of the analytics dashboard and clicks **Aplicar**. `analyticsAdminService.getDashboard(from, to)` re-fetches all KPI widgets and charts (orders trend, customers, devices, top peluches, traffic sources) for the new range.

### backoffice-analytics-export-csv

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice` |
| **API endpoints** | `GET /api/analytics/export/orders/?from=<date>&to=<date>` |

Staff clicks the **↓ CSV** button on `/backoffice`. `analyticsAdminService.exportOrdersCSV(from, to)` triggers a browser download of a CSV file scoped to the current date range.

### backoffice-peluch-toggle-featured

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches` |
| **API endpoints** | `PATCH /api/peluches/<slug>/` |

Staff clicks the ⭐ button on a peluch row. `peluchAdminService.update` flips the `is_featured` flag. The list enforces a cap of 4 simultaneously featured peluches; attempting to feature a 5th surfaces an error toast.

### backoffice-peluch-delete

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches` |
| **API endpoints** | `DELETE /api/peluches/<slug>/` |

Staff clicks **Eliminar** on a peluch row. An inline "Sí / Cancelar" confirmation appears; clicking **Sí** calls `peluchAdminService.delete(slug)` and the row disappears from the table.

### backoffice-peluch-bulk-category

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches` |
| **API endpoints** | `PATCH /api/peluches/bulk-category/` |

Staff selects multiple peluches via row checkboxes (or the header "select all"). The bulk action bar appears. Staff picks a target category from the **Asignar categoría…** dropdown and clicks **Asignar**. `peluchAdminService.bulkUpdateCategory(slugs, categoryId)` updates them all in one request, the selection clears, and the table re-renders.

### backoffice-category-create

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/categorias` |
| **API endpoints** | `POST /api/categories/` |

Staff clicks **+ Nueva categoría**. A modal opens with name, description, display_order, is_active, is_featured, and image upload fields. Submitting calls `categoryAdminService.create(payload)`; on success the modal closes and the new row appears in the table.

### backoffice-category-edit

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/categorias` |
| **API endpoints** | `PATCH /api/categories/<id>/` |

Staff clicks **Editar** on a category row. The modal opens pre-filled with existing values. Modifying any field and clicking **Guardar categoría** sends `PATCH /api/categories/<id>/`. On success the row updates and the modal closes.

### backoffice-category-delete

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/categorias` |
| **API endpoints** | `DELETE /api/categories/<id>/` |

Staff clicks **Eliminar** on a category row. An inline "Sí / Cancelar" confirmation appears; clicking **Sí** calls `categoryAdminService.delete(id)` and the row disappears.

### backoffice-user-toggle-role

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/usuarios` |
| **API endpoints** | `PATCH /api/users/<id>/` |

Staff clicks **Hacer admin** (or **Hacer cliente** if the user is already admin) on a user row. `userAdminService.update({ role, is_staff })` toggles between `customer/false` and `admin/true`. The row label and badge switch accordingly.

### backoffice-user-toggle-active

**Roles:** staff. **Ruta:** `/backoffice/usuarios`. **API:** `PATCH /api/users/<id>/`.

El staff pulsa Activar o Desactivar en la fila del usuario. El cuerpo cambia únicamente `is_active`; el servidor conserva `email_verified` y responde con ambos datos. El texto Estado se actualiza según los tres estados documentados. Un error de la API se muestra sin presentar el cambio como completado.

---

### backoffice-order-status-update

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/pedidos` |
| **API endpoints** | `PATCH /api/orders/<order_number>/status/` |

Staff changes the status `<select>` on an order row. `orderService.updateStatus(orderNumber, newStatus)` persists the change and creates a new `OrderStatusHistory` record on the backend. The badge re-renders with the new color.

### backoffice-order-tracking-update

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/pedidos` |
| **API endpoints** | `PATCH /api/orders/<order_number>/tracking/` |

Staff types a tracking number into the per-row input and clicks the **✓** button. `orderService.updateTracking(orderNumber, trackingNum)` saves carrier and guide; the field shows the saved value.

### backoffice-promo-banner-save

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/configuracion` |
| **API endpoints** | `PUT /api/content/promo_banner/` |

Staff toggles **Activa**, edits the message (max 120 chars), and picks background/text colors (preset buttons or custom picker) on the configuración page, then clicks **Guardar cinta**. `contentService.update('promo_banner', { is_active, message, bg_color, text_color })` persists the JSON. The button cycles **Guardar → Guardando… → ✓ Guardado** (auto-resets after 3 s).

### backoffice-hero-image-upload

Staff selects and uploads a hero image. The backend saves the new file first,
locks the content record, publishes its URL and deletes the former file after
commit. Storage/database replacement failure shows an actionable error while
the previous public hero remains usable. Invalid, oversized or corrupt files
retain validation errors. A later cleanup failure does not undo the new image.

---

## Flows added in version 1.5.0 (2026-05-21)

These flows were registered after the "incremental color image upload" feature was implemented in `PeluchForm`. The existing `backoffice-peluch-create` umbrella flow remains in place; the four flows below cover the new sub-behaviors with finer-grained specificity.

### backoffice-peluch-create-draft-on-color-upload

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches/nuevo` |
| **API endpoints** | `POST /api/peluches/`, `POST /api/peluches/{slug}/color-image/{color}/` |

**Preconditions:** Staff is on the create-peluch form. No draft yet exists for this session.

**Steps:**

1. Staff navigates to `/backoffice/peluches/nuevo`.
2. Staff selects at least one color and picks an image file for it.
3. Before the upload: no `POST /api/peluches/` has been issued yet.
4. On the first color-image selection, the form automatically sends `POST /api/peluches/` with `is_active=false` (creating a DRAFT peluch).
5. Backend returns the draft peluch with a `slug`.
6. The form transitions to edit mode: subsequent image uploads use `POST /api/peluches/{slug}/color-image/{color}/`, and the main form submit sends `PATCH /api/peluches/{slug}/` instead of a new `POST`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Draft POST fails | Upload aborted; error shown; form remains in create mode |
| No color images uploaded | `POST /api/peluches/` is NOT called until the form is submitted normally |

---

### backoffice-peluch-color-upload-per-image-status

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches/nuevo` (also applies to `/backoffice/peluches/[slug]`) |
| **API endpoints** | `POST /api/peluches/{slug}/color-image/{color}/` |

**Preconditions:** A draft (or existing) peluch slug is available. At least one color is configured.

**Steps:**

1. Staff selects an image file for a color.
2. The color-image row immediately shows an "uploading" spinner.
3. On success: spinner replaced with a done checkmark (✓).
4. On network/server error: spinner replaced with a "failed" badge and a per-image **Reintentar** button.
5. If one or more images have failed, a **Reintentar fallidas** ("retry all failed") button appears.
6. The **Guardar** / **Crear** submit button is DISABLED as long as any image upload is in `uploading` or `failed` state.
7. The submit button re-enables once all started uploads have resolved to `done`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| All uploads succeed | Submit button enabled; no retry buttons shown |
| One or more uploads fail | Submit button disabled; per-image retry + global retry visible |
| Staff clicks per-image retry | That image re-uploads; status cycles through uploading → done/failed |
| Staff clicks retry-all | All failed images re-upload simultaneously |
| Image exceeds size before upload | Client-side compression runs first; compressed blob is sent |

---

### backoffice-peluch-create-cancel-discards-draft

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches/nuevo` |
| **API endpoints** | `DELETE /api/peluches/{slug}/` |

**Preconditions:** A draft peluch has been auto-created (first color-image upload triggered the draft POST).

**Steps:**

1. Staff clicks **Cancelar** on the create-peluch form.
2. A confirmation prompt appears asking whether to discard the draft.
3. Staff confirms discarding.
4. Frontend calls `DELETE /api/peluches/{slug}/` to remove the draft from the backend.
5. User is navigated to `/backoffice/peluches`.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| Staff dismisses the confirmation | Form stays open; draft is NOT deleted |
| No draft yet created (cancel before first color upload) | No DELETE is issued; user navigates away immediately |
| DELETE fails | Error message shown; user may retry or stay on form |

---

### backoffice-peluch-list-draft-badge

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Roles** | staff |
| **Frontend route** | `/backoffice/peluches` |
| **API endpoints** | `GET /api/peluches/` (admin endpoint returning all peluches including inactive) |

**Preconditions:** At least one peluch with `is_active=false` exists in the database (e.g., an abandoned draft).

**Steps:**

1. Staff navigates to `/backoffice/peluches`.
2. Frontend fetches all peluches via `peluchAdminService.listAll()`.
3. The table renders each peluch row.
4. For peluches with `is_active=false`, a **Borrador** badge is rendered next to the title.
5. For peluches with `is_active=true`, no Borrador badge is shown.

**Branching conditions:**

| Condition | Behavior |
|-----------|----------|
| All peluches are active | No Borrador badges shown anywhere in the table |
| All peluches are drafts | Every row shows the Borrador badge |

## Flows added in version 1.5.2 (2026-09-27)

### backoffice-order-filter

**Role:** staff · **Priority:** P2 · **Route:** `/backoffice/pedidos`.

Staff abre Pedidos desde el dashboard y selecciona un estado o Todos.
El filtro vuelve a página 1 y consulta
`GET /api/orders/list/?page=1&page_size=100&status=<status>`, sin estado para Todos.
Sólo la respuesta vigente publica filas y el total del servidor.
Cambiar de filtro o abandonar la página aborta la consulta anterior; su éxito,
rechazo o finalización tardíos no cambian las filas, error o carga actuales.

| Class | Behavior |
|-------|----------|
| success | El filtro consulta página 1 y sólo su respuesta vigente publica las filas. |
| error | n/a: fixed status buttons accept no free-form input; authorization belongs to the existing backoffice guard. |
| failure | The active request fails and shows `No se pudieron cargar los pedidos.`; superseded requests cannot show an error. |
| display | Tabla inicial, total, carga y vacío pertenecen a `backoffice-order-management`. |

Una respuesta vigente vacía muestra `Sin pedidos`. Los selectores usan botones
accesibles y `data-testid="order-row-<order_number>"`; E2E cubre éxito y fallo
con respuestas controladas que contienen filas distinguibles.

## Pedidos — ronda del 1 de octubre de 2026

### backoffice-order-pagination

**Role:** staff · **Priority:** P2 · **Route:** `/backoffice/pedidos`.

Staff usa **Página siguiente** o **Página anterior** cuando la respuesta vigente
permite avanzar o retroceder. La pantalla consulta
`GET /api/orders/list/?page=<n>&page_size=100`, conserva el filtro seleccionado
y reemplaza las filas por las de esa página. Anuncia `Página N de M`;
las direcciones sin página disponible quedan deshabilitadas.

| Class | Behavior |
|-------|----------|
| success | Avanzar o retroceder muestra las filas de la página solicitada. |
| error | n/a: no hay entrada libre de página; los controles acotados impiden solicitar una dirección inexistente. |
| failure | El fallo vigente muestra `No se pudieron cargar los pedidos.` y deshabilita ambas direcciones. |
| display | Filas iniciales, total, indicador de página, carga y vacío pertenecen a `backoffice-order-management`. |

Selectores: navegación `Paginación de pedidos`, botones `Página siguiente` /
`Página anterior` y filas `data-testid="order-row-<order_number>"`.


## Inicio — ronda del 30 de septiembre de 2026

Estos identificadores son los del registro E2E vigente. La ruta de entrada es `/`, accesible sin iniciar sesión. Los servicios de productos, categorías, reseñas y contenido se sustituyen por respuestas controladas en los tests; no se consulta la base de producción.

| Flow ID | Interacción y resultado observable | Clase | Prioridad |
|---------|-----------------------------------|-------|-----------|
| `home-loads` | Muestra el título, los productos y las reseñas. El título ocupa como máximo dos líneas a 412 y 835 px; los nombres largos de reseñas caben en sus tarjetas. | display | P1 |
| `home-product-carousel` | Pulsa un punto del carrusel con un área mínima de 44 × 44 px, selecciona el segundo producto y abre su detalle correspondiente. | success | P3 |
| `home-to-catalog` | Sigue el enlace del catálogo desde Inicio y encuentra los productos ofrecidos en `/catalog`. | success | P2 |
| `home-faq` | Abre una pregunta existente, lee la respuesta y la vuelve a cerrar; el contenido permanece dentro de la página. | success | P3 |

La matriz es 412 × 915, 835 × 1194, 1195 × 835, 1440 × 900 y 2560 × 1440, declarada una sola vez en `frontend/e2e/helpers/viewports.ts`. Cada prueba por anchura debe ejercer una interacción real. El carrusel móvil y la grilla de escritorio son las dos presentaciones existentes del mismo flujo.

No hay estados de error o fallo propios de las preguntas locales: no hacen solicitudes. Los fallos de servicios no se alteran en esta ronda. `home-to-blog` conserva su exención: Inicio no tiene un enlace a Blogs. Los componentes compartidos de navegación y animación quedan fuera del módulo seleccionado.


### Cobertura de la ronda

| Rol | Flujo | Test dueño | Resultado exigido |
|-----|-------|------------|-------------------|
| Invitado o usuario | `home-loads`, `home-faq`, `home-product-carousel`, `home-to-catalog` | `frontend/e2e/home/home-layout.spec.ts` | Datos concretos, geometría de tarjetas, respuesta de FAQ y navegación real en los presets correspondientes. |
| Personal administrativo | `backoffice-dashboard-display` | `frontend/e2e/backoffice/backoffice-analytics.spec.ts` | El paquete real de gráficos se solicita tras llegar los datos; los scripts compilados respetan los límites de transferencia. |
| Personal administrativo | `backoffice-analytics-date-filter` | `frontend/e2e/backoffice/backoffice-analytics.spec.ts` | El período exacto cambia el resumen de pedidos y conserva las series del gráfico. |
| Personal administrativo | `backoffice-analytics-export-csv` | `frontend/e2e/backoffice/backoffice-analytics.spec.ts` | Descarga el contenido del CSV seleccionado; un error del servicio muestra el aviso existente y permite volver a exportar. |

Convenciones: `@flow` desde el registro y `@outcome` inline; fixtures de red controladas en el navegador; sin condiciones que permitan aprobar cuando faltan controles o datos. Las repeticiones de anchura pertenecen al mismo flujo y no crean un módulo responsive. Los estados de error/fallo no aplicables al FAQ se justifican arriba; el fallo real del CSV se registra como `failure`.

## Privacy recovery — 2026-10-02

### checkout-personalization-media-recovery

A rejected huella/audio reference is displayed on its exact checkout line with
**Volver a personalizar**. Recovery opens `/peluches/[slug]?cartItem=<peluch>-<size>-<color>`,
locks the existing product/variant/quantity and uploads the replacement. Save
changes only personalization fields/cost and returns to checkout with the
other cart lines intact. Upload or order failure remains visible.

### app-peluch-audio

Audio upload returns both `media_id` and `media_token`, preserved on the cart
line and sent to checkout. Client-size and server-side errors remain visible.

### order-access-recovery

The shared component on tracking/payment/confirmation collects purchase email,
requests a generic acknowledgement and verifies a six-digit code. Success
stores per-order access and retries the private query. Invalid, expired,
consumed, mismatched or rate-limited details yield the same error; network
failure remains actionable. Denial preserves cart and hides private data.

## E2E Coverage Index additions

| Flow ID | Required outcomes |
|---------|-------------------|
| `checkout-personalization-media-recovery` | display · success · error · failure |
| `order-access-recovery` | display · success · error · failure |
| `tracking-by-order-number` | display · success · error · failure |
| `tracking-auto-from-wompi` | display · success · error · failure |
| `payment-page-display` | display · success · error · failure |
| `order-confirmed-display` | display · success · error · failure |
| `backoffice-hero-image-upload` | display · success · error · failure |

This update rechecked the changed privacy/image flows from application code;
it preserves unrelated gaps and does not claim the whole registry was reviewed.

## Flows rechecked in version 1.5.6 (2026-10-08)

### Cart controls

`cart-update-qty` uses the visible +/− buttons. Increment and decrement update
the exact subtotal; decrement at one leaves the line present. Removal uses
the separate Eliminar button. Reload preserves the changed quantity.
`cart-multiple-products` requires exactly the two selected product titles and
their combined subtotal. The old gaps about nonexistent quantity inputs and
cart-item selectors are removed because the replacement specs use real controls.

### Checkout pricing and pending submission

Product, cart and checkout show the same nearest-even hundred-peso rounding
as the server. A 50.100 COP product at 50 % yields a 25.000 COP deposit, which
is also the order's amount when navigating to payment.
`purchase-loading-state` holds a real HTTP response boundary: while pending,
Procesando... is disabled. A 502 response shows its error, preserves the cart,
enables submit and allows a second request. Existing success/error outcomes
remain declared; this test covers display/failure.

### Review ownership

Public reviews omit the author's email. The authenticated request receives
`is_mine` for its own review, which suppresses the review form. A guest sees
the sign-in prompt; an authenticated visitor viewing someone else's review
can submit and sees the moderation acknowledgement. The delivered-order
requirement and backend duplicate protection remain in force.

### backoffice-navigation

Staff sees a drawer below 1024 px and a fixed 220 px sidebar at larger widths.
The drawer opens through Abrir menú, exposes the six administrative links and
closes after navigating to Pedidos or tapping outside. The order list must
display the expected order and customer. Content uses the full width with a
closed drawer, and rotation portrait → landscape → portrait preserves usable
navigation without a residual overlay.

Acceptance uses 412×915, 835×1194, 1195×835, 1440×900 and 2560×1440 plus rotation.
This flow does not certify Escape handling, focus return or touch-target size;
those accessibility obligations remain open outside the approved change.
