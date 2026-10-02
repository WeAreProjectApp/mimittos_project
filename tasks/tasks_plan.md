---
trigger: manual
description: Task backlog, feature completion status, known issues, and test coverage tracking for Mimittos.
---

# Tasks Plan — Mimittos

## Acceso y limpieza de archivos — 2026-10-02

- [x] Exigir reCAPTCHA también al emisor `/api/token/` (`I-S-3f3f6586dddd`).
- [x] Separar correo verificado y bloqueo administrativo (`I-S-5e80efb8c293`).
- [x] Conservar referencia cuando falla borrar un archivo (`I-O-f4fee980342f`).
- Validación requerida: migración, permisos, códigos y limpieza en pruebas aisladas.
- Flujos de registro y estados administrativos auditados; la aceptación requiere E2E del commit final.
- Entrega requerida: reportes/ledger propios publicados y PR abierto con CI verde.
- Resultado de aceptación y entrega: reporte de la ronda en el toolkit, con SHA y evidencia tipada.

Las cuentas antiguas inactivas conservan su bloqueo; su clasificación es una
decisión explícita de staff. Los códigos anteriores necesitan reenvío.
La recuperación futura del seguimiento será mediante código por correo y
permanece pendiente por el límite global de tres causas. No se aplica migración
ni deploy desde esta ronda.

## Ronda transversal — 2026-10-01

- [x] Restringir lecturas del directorio de usuarios a staff (`I-S-1421690fa05c`).
- [x] Paginar ventas conservando campos y acceso (`P-backend-views-02`).
- [x] Paginar pedidos, mantener filtros y adaptar navegación administrativa (`P-backend-views-03`).
- Validación requerida: permisos, páginas y filtros, consultas y payload acotados,
  solicitudes fuera de orden, acciones de pedidos y cinco anchos para los controles nuevos.
- Entrega: ampliar PR #76 y comprobar su CI sobre el commit final; evidencia
  por ronda en el ledger común y reporte del toolkit. Sin merge ni deploy.

Se detiene en tres causas globales. Observabilidad, mantenibilidad y navegación
pública conservan hallazgos pendientes; el cupo no certifica suficiencia.

## Ronda de rendimiento e Inicio — 2026-09-30

- [x] Agrupar lecturas al crear ventas sin alterar líneas, cantidades ni errores (`P-backend-queries-11`).
- [x] Compartir sólo la solicitud pendiente de blogs (`P-frontend-stores-02`).
- [x] Diferir los gráficos del dashboard y conservar filtros, series y CSV (`P-frontend-components-02`).
- [x] Corregir título, reseñas y objetivos táctiles de Inicio según el estándar.
- [x] Abrir [PR #76](https://github.com/WeAreProjectApp/mimittos_project/pull/76) desde el worktree propio.
- Validación: presupuesto de lecturas y solicitudes, datos de gráficos, cinco anchuras y build de producción; veredicto y evidencia en los reportes perf/responsive/QA de esta ronda en el toolkit.
- Cierre: verificar CI del último commit en el PR #76. El merge pertenece al operador.

## Ronda de rendimiento — ventas y filtros (2026-09-27)

- [x] P-backend-queries-10: precargar relaciones del detalle de ventas.
- [x] P-frontend-views-02: cancelar consultas reemplazadas y proteger el estado vigente.
- [x] Abrir [PR #74](https://github.com/WeAreProjectApp/mimittos_project/pull/74) desde un worktree independiente.
- [x] Validar presupuesto, regresiones y flujo E2E administrativo.
- [x] Completar quality gate local y auditoría independiente del lote.
- Entrega: esperar CI verde en el PR #74; el estado vigente se verifica en GitHub. Sin merge.

El candidato sobre creación de ventas se trabaja en la ronda del 30 de septiembre.

## Ronda de rendimiento — 2026-09-27

- [x] Agrupar imágenes de blogs: `P-backend-queries-08`.
- [x] Agrupar galerías de productos legacy: `P-backend-queries-09`.
- [x] Recorrer la exportación por bloques: `P-backend-views-01`.
- [x] Verificar presupuestos y regresiones con QA backend: 16 casos nuevos y 22 regresiones.
- [x] Publicar PR #73; el estado vigente de CI se comprueba al cierre, sin merge ni deploy.

La paginación de listados y el streaming del CSV quedan como escalaciones de
contrato, fuera de esta ronda. No hay cambios de flujo frontend ni de esquema.

## Limpieza del repositorio — 2026-09-25

- [x] Revalidar en `origin/main` los cinco módulos frontend sin uso y sus tests.
- [x] Retirar el lote aprobado, mocks antiguos y dependencia next-intl.
- [x] Ignorar reportes generados por CI y corregir referencia al spec smoke ausente.
- [x] Actualizar las guías operativas con el stack, rutas y despliegue comprobados.
- [x] Validar 14 tests de regresión, build y quality gate sin relajar umbrales
  (0 errores; Ruff no disponible localmente).
- Cierre: PR con CI verde y squash autorizado. Consultar su estado en GitHub;
  el merge no ejecuta deploy ni modifica el checkout principal.

Pendiente separado: el objetivo bilingüe histórico del PRD no está implementado.
Los assets sin referencias literales necesitan evidencia de uso desde contenido
persistido antes de considerar su borrado.

## Ronda de rendimiento — 2026-09-25

- [x] P-frontend-views-01: agrupar solicitudes de precio y proteger la selección vigente.
- [x] P-frontend-components-01: diagnosticar carga masiva; propuesta de cola pendiente de presupuesto canónico, sin cambios al uploader.
- [x] QA: cubrir presupuesto, respuestas fuera de orden y compatibilidad con pruebas unitarias; adaptar el E2E del filtro a navegación y teclado reales.
- Entrega y ejecución E2E: [PR #70](https://github.com/gustavop-dev/mimittos_project/pull/70); el estado de CI se verifica en sus checks. Cierre de sesión con PR abierto y CI verde, sin merge.

## Ronda de rendimiento — 2026-09-24

PR #68: `P-backend-queries-04` (KPIs), `P-backend-queries-05` (reseñas) y
`P-frontend-stores-01` (sesión). Implementación y QA local completos; entrega mediante PR abierto con CI verde.
Los presupuestos y tests se declaran en `.testquality.yml`. Los siguientes
candidatos del scout (creación de pedidos y precarga de Mis pedidos) quedan en
el ledger del toolkit para otra ronda.


Última actualización: 2026-09-24 (ronda de rendimiento de pedidos).

## Trabajo actual — rendimiento de pedidos

- [x] Agrupar las lecturas de validación y precios de creación de pedidos sin
  modificar reglas ni contrato (`P-backend-queries-06`).
- [x] Retirar la precarga no utilizada por Mis pedidos (`P-backend-queries-07`).
- [x] Completar QA de presupuestos, errores, precios actualizados y aislamiento.
- [x] Abrir PR #69 para entrega; el CI vigente se consulta en GitHub y se verifica
  sobre el último commit antes del cierre de la sesión.

El filtro de precio del catálogo queda registrado como candidato futuro en el
ledger del toolkit. No ampliar esta ronda a cargas de imágenes ni paginación.

---

## Feature Status

### ✅ Completed

| Feature | Notes |
|---------|-------|
| Auth system | Email/password + Google OAuth + email verification + password reset |
| Product catalog | Peluch listing, filtering by category/size/color, featured products |
| Peluch detail | Gallery, size/price selector, personalization options (huella, corazón, audio) |
| Cart | Guest cart via localStorage + `cartStore`; persistence across sessions |
| Checkout | Wompi integration (credit/debit/PSE); order creation on payment |
| Wompi webhook | Auto status updates from Wompi events; transaction records |
| Order tracking | `/tracking?order=<id>` public; `/orders` authenticated history |
| Reviews | Post-delivery reviews; staff approval flow |
| Backoffice | Order management, peluch CRUD, category management, user list |
| Blog | Título, descripción, categoría e imagen; listado y detalle públicos |
| Analytics | Page view tracking; KPI dashboard; data export |
| Email system | Plantilla Django compartida para emails transaccionales |
| Captcha | Google reCAPTCHA integration on auth endpoints |
| Media uploads | Image/audio for personalization; compression + validation |

---

## Testing Status

### Backend (pytest)

| Metric | Count |
|--------|-------|
| Test files | 41 |
| Categories | models (5), serializers (6), services (7), views (15), utils (5), commands (3) |
| Coverage reports | `.coverage_full.json`, `.catalog_cov.json`, `.coverage_out.json` |

### Frontend Unit (Jest + Testing Library)

| Metric | Count |
|--------|-------|
| Test files | 60 |
| Categories | page, component, store, hook, service, util, i18n, app |

### E2E (Playwright)

| Metric | Count |
|--------|-------|
| Test files | 20 |
| CI matrix shards | 6 (public, catalog, auth, purchase, app, backoffice) |
| Flow coverage | 61/61 in `flow-definitions.json` |
| Test quality gate | 99/100 |

---

## Historical Work — 2026-05-01

**Branch**: `double-check-30042026`
**Status**: Stabilizing CI before merge to main

Recent completions on this branch:
- Fixed `http.ts` 401 interceptor refreshing on unauthenticated requests (caused sign-in error to redirect to home instead of showing message) — `701e083`
- Expanded CI E2E matrix from 4 → 6 shards so all 20 spec files run, lifting CI flow coverage from 33/61 to 61/61 — `9598e89`
- Made invalid-credentials E2E test deterministic by mocking `sign_in/` to return 401 — `fdfb66e`

---

## Known Issues

None documented.

---

## Backlog

### Test Infrastructure Fixes (from /new-feature-checklist audit 2026-04-24)

#### Backend
- [ ] Create `base_feature_app/tests/factories.py` — centralized factory-boy factories with unique slugs
- [ ] Update `base_feature_app/tests/conftest.py` to use factories + add `verified_user`, `unverified_user`, `order_item_with_personalization_media` fixtures

#### Frontend Unit
- [ ] Add `app/__tests__/page.test.tsx` (Home page — FAQ accordion, product carousel, add-to-cart)
- [ ] Add `app/backoffice/peluches/nuevo/__tests__/page.test.tsx`
- [ ] Add `app/backoffice/peluches/[slug]/__tests__/page.test.tsx` (loading, not-found, edit mode)
- [ ] Add `detectDevice` / `detectTrafficSource` tests to `usePageView.test.ts`
- [ ] Add network-error / 500-error scenarios to `paymentService.test.ts`
- [ ] Raise Jest thresholds from 50% to 65% global (stores 75%, utils 90%)

#### E2E (from /new-feature-checklist audit 2026-04-24 — most items now resolved)
- [x] Flow constants added; `auth-success.spec.ts`, `dashboard.spec.ts`, `backoffice/*.spec.ts` all exist and pass
- [ ] Add cart quantity=0 removes item test to `cart.spec.ts`
- [ ] Update USER_FLOW_MAP.md note: flow-definitions.json is authoritative source; IDs in USER_FLOW_MAP map to flow-definitions keys

### Flow Audit Findings (2026-05-01) — pending product decisions

**New flows to register** (4):
- `backoffice-site-configuration` — promo banner + hero image management (`frontend/app/backoffice/configuracion/page.tsx`)
- `catalog-filter-by-category` and `catalog-sort-products` — filter/sort interactions on `/catalog`
- `auth-forgot-password-submit` — submission path beyond the form-display flow

**Partial-coverage flows** (existing IDs, specs only assert page renders):
- `backoffice-category-management`, `backoffice-user-management`, `backoffice-peluch-create`, `backoffice-peluch-edit`, `payment-page-display`, `checkout-wompi-redirect`

**Cleanup**:
- `app-dashboard-access` flow id is misleading — `/dashboard` route does not exist; tests actually exercise `/orders` redirect

**Product bugs surfaced by audit**:
- Contact form (`frontend/app/contact/page.tsx`) has no backend handler — submit is silent no-op
- Backoffice has no UI for blog management despite full CRUD endpoints in `backend/base_feature_app/urls/blog.py`

## Ronda de rendimiento — 2026-09-24

- [x] Catálogo/listado y destacados: precio disponible anotado y relaciones precargadas.
- [x] Detalle/tracking: precarga agrupada de items, medios, pago e historial.
- [x] Dashboard: clientes en SQL y reutilización de agregados exactos.
- [x] QA: 18 casos nuevos y 14 regresiones sobre presupuestos de queries y contratos conservados.
- Entrega: PR #67; el estado vigente del CI se consulta en el PR.
- Pendiente externo a la ronda: validación ejecutada MySQL aislada y contrato paginado para catálogo.
