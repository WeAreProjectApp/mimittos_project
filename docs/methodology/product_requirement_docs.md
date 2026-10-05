---
trigger: manual
description: Product requirements document — why Mimittos exists, core features, users, and business rules.
---

# Product Requirements — MIMITTOS

**Más que un peluche, un recuerdo**

> Estado verificado el 2026-09-25: el objetivo bilingüe descrito en este PRD
> sigue pendiente. La interfaz actual está en español y Blog no tiene variantes
> por idioma. La limpieza retiró infraestructura i18n sin consumidores; no cancela
> el requerimiento de producto. La implementación vigente está documentada en
> `technical.md` y `architecture.md`.

---

## 1. Project Overview

MIMITTOS is a direct-to-consumer e-commerce platform for handmade, personalized plush toys (peluches) crafted in Colombia. Customers discover, customize, and purchase unique peluches that become personalized keepsakes. The artisan manages the full order lifecycle through a backoffice.

---

## 2. Problem Statement

- Customers have no streamlined way to browse, personalize, and order custom handmade peluches online
- The artisan needs a reliable order management system that handles Colombian payment infrastructure (Wompi) and tracks fulfillment status
- Content must be bilingual (Spanish primary, English secondary) to serve a broader Colombian and Latin American audience

---

## 3. Core Features

### 3.1 Public Catalog

- Browse peluches by category, size, color
- View detailed peluch page (`/peluches/[slug]`) with gallery, size/price table, and customization options
- Featured peluches on homepage

### 3.2 Personalization

Four customization layers per peluch order:
- **Huella** — custom footprint imprint
- **Corazón** — personalized heart message
- **Audio** — upload an audio clip embedded in the peluch
- **Size + Color** — select from available SKU combinations

### 3.3 Cart & Checkout

- Guest cart (localStorage-persisted via `cartStore`)
- Wompi payment gateway (Colombian credit/debit/PSE)
- Automatic order creation and Wompi transaction linking
- Webhook-driven order status updates from Wompi

### 3.4 Order Tracking

- Authenticated users: `/orders` shows full order history
- Public tracking: `/tracking?order=<id>` shows live order status
- Wompi auto-redirect flow from checkout confirmation

### 3.5 Reviews

- Authenticated users submit reviews on peluches after receiving orders
- Staff can approve/reject reviews via backoffice
- Reviews display on peluch detail page

### 3.6 Backoffice (Staff Only)

- `/backoffice` — dashboard with user list, order management
- Manage peluches: create, edit, update stock
- Manage categories
- View and update order statuses

### 3.7 Blog

- Bilingual blog posts (ES/EN) stored as structured JSON
- Public routes: `/blogs` (listing), `/blogs/[blogId]` (detail)
- Staff creates/manages posts through Django admin

### 3.8 Analytics

- Page view tracking via `PageView` model
- Admin analytics dashboard: KPIs, order trends, export

### 3.9 Authentication

- Email/password registration with email verification
- Google OAuth (`@react-oauth/google`)
- Password reset via email passcode
- JWT tokens (stored in cookies via js-cookie)

Regla de acceso aprobada el 2026-10-02: el correo verificado y la habilitación
administrativa se mantienen separados. Recuperar contraseña o verificar correo
nunca activa una cuenta bloqueada. Las cuentas antiguas inactivas requieren
activación manual del equipo; el listado administrativo muestra el bloqueo,
el correo pendiente y la cuenta habilitada como tres estados distintos.

---

## 4. Users

| Role | Access |
|------|--------|
| **Guest** | Browse catalog, add to cart, checkout, track orders |
| **Authenticated User** | All guest access + order history, leave reviews |
| **Staff** | All user access + backoffice (orders, peluches, users, categories) |

---

## 5. Business Rules

- **Bilingual**: Spanish is the primary language; all content has `_es`/`_en` variants
- **Wompi only**: Payment exclusively through Wompi (Colombia); no international cards without Wompi support
- **Personalization media**: Audio uploads validated for type/size; images compressed before upload
- **Review gate**: Reviews only allowed after the order has been delivered (enforced server-side)
- **Cart is guest-first**: No login required to add items and checkout; auth is optional
- **Order tracking is public**: Anyone with an order ID can track their order

---

## 6. Out of Scope

- International payment gateways (Stripe, PayPal)
- Multi-vendor marketplace
- Real-time chat or support system
- Mobile native apps (web-only)
