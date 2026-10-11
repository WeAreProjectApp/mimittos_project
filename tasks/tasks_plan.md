---
trigger: manual
description: Task backlog, feature completion status, known issues, and test coverage tracking for Mimittos.
---

# Tasks Plan — Mimittos

## Ronda transversal r5 — 2026-10-10

- [x] Diagnosticar los seis frentes sobre `14a310a` y aprobar sólo tres causas
  con propiedad exclusiva por archivo.
- Separar líneas del carrito con personalizaciones/cotizaciones distintas;
  conservar persistencia versión 0 y recuperación de enlaces heredados
  (`I-M-9668da267913`).
- Impedir que una respuesta obsoleta del detalle administrativo publique
  datos, error o fin de carga sobre otro pedido (`I-O-532fcbbffd28`).
- Exigir lectura válida antes de editar/guardar la cinta y habilitar reintento
  manual de lectura (`I-O-ff31c1101cab`).
- Validar mutaciones y recargas de hermanos del mismo SKU, recuperación de
  archivos, respuestas fuera de orden y bloqueo/recuperación del GET de cinta.
- Auditar los flujos afectados y añadir `backoffice-order-detail`; preservar
  las brechas históricas sin ampliar esta ronda a deuda independiente.
- Entregar un PR por frente más documentación compartida, verificar la
  combinación, integrar con merge-queue y comprobar el cierre mediante
  `all-in-base --check-only` antes de retirar recursos propios.

La evidencia de implementación, aceptación y entrega se conserva en el registro
local `/tmp/mimittos-improvement-10102026-r5/` y los PR de esta ronda. Esos
resultados, no este listado de requisitos, determinan su estado final. No se
publica trabajo en toolkit ni se modifica el checkout desplegado.

Pendientes por cupo, ambos elegibles: tres E2E de categorías que sólo esperan
la petición, y el guardado de cinta que queda bloqueado si falla el PUT.
No confundirlos con descartes por bajo retorno. Banco conserva su bloqueo
contractual; responsividad requiere reproducción en la matriz canónica.

## Cierre de rondas anteriores — 2026-10-10

- [x] Integrar PR #101–#103, #105–#109, #111–#115 y #117–#119.
- [x] Cerrar R4 con tres causas y QA combinada: enlace de invitado, descarte
  recuperable y vigencia del filtro de analytics; `main` final `14a310a`.
- [x] Comprobar igualdad del árbol de R4 con el tren probado `48b94bf` y
  conservar su evidencia de 66 casos locales útiles.
- [x] Cerrar el borrador #120 sin merge y retirar los recursos propios de R4.

Las brechas parciales históricas permanecen abiertas. Los PR antiguos
integrados no se reutilizan ni se vuelven a incluir en merge-queue.

## Ronda transversal r2 — 2026-10-10

- [x] Acotar tres causas y propiedad por frente: multipart Django 6.0.9,
  borradores administrativos y rechazo visible del registro sin envío
  confirmado (`I-S-271c810dfba7`, `I-M-92a9cae19e6f`, `I-O-ffdd56735eed`).
- [x] Actualizar contratos dirigidos del registro y mapa sin nuevas rutas,
  flows ni ampliación de baseline.
- [x] Integrar aplicación/tests/pin/documentación inicial: `160beb3bd70b1dd5b22c9a9b3d70def2464d1972`.
- [x] Ejecutar 65 casos backend, 18 unit y gate estricto de seis archivos en
  esa combinación; artefactos sin fallos/errores/skips.
- [x] Completar E2E 19/19 y dictamen APPROVED de los tres candidatos en
  `160beb3`; preservar el intento fallido del harness de cookies/hostname.
- [x] Corregir únicamente el caso de retroceso que bloqueó CI: tarjeta visible,
  llegada al detalle y dos destinos de back obligatorios; diff/AST/gate focal.
- [x] Integrar el cierre documental y el caso corregido mediante PR #109;
  los cinco PR de R2 ya están integrados en `main`.
- La aceptación del cierre se consulta en los PR y el archivo de evidencias
  de R2. Los 102 casos aprobados en `160beb3` siguen describiendo sólo ese
  commit intermedio; no acreditan automáticamente revisiones posteriores.

APIClient usa scratch real y medios temporales; E2E usa UI real con frontera
HTTP simulada. No afirmar integración navegador–Django ni monitoring vivo.
Reporte: `docs/audits/2026-10-10-mimittos-improvement-pass-r2.md`; el informe
anterior se conserva. El retorno visible de editar/borrar categorías sigue
pendiente por cupo; Wompi y responsividad no se implementan en esta ronda.


## Ronda transversal dirigida — 2026-10-10

- Corregir pre-registro: exigir contraseña nueva al verificar, invalidar la
  contraseña anterior y conservar cuenta/código ante rechazos.
- Mostrar rechazos de cantidad/disponibilidad en la línea correcta del
  checkout, con carrito conservado y corrección/reintento disponibles.
- Sustituir el caso P1 de compra que omitía acciones por un recorrido
  determinista hasta checkout, sin pagar.
- Cerrar con una QA de la combinación limpia, aislamiento de API/BD y
  artefactos del SHA exacto; CI y entrega corresponden al orquestador.

Los tres primeros puntos tienen autoría asignada; el estado de validación
se registra en `docs/audits/2026-10-10-mimittos-improvement-pass.md`. No se
reabre el carrito/rechazo pendiente reparado anteriormente. Polling Wompi,
medición del catálogo y mejoras responsive siguen pendientes fuera del lote.

## Ronda transversal r3 — 2026-10-09

Entregado en PRs por frente (seguridad, rendimiento, observabilidad,
mantenibilidad, responsividad, QA y compartido), integrados con merge-queue.

Pendiente de decisión o de otra ronda:
- Montos de pago completo: definir qué es "Abono"/"Ingresos" y corregir correos, Mis pedidos, KPIs, CSV y la página de pago.
- Contrato PSE/Bancolombia: el polling dentro del request puede superar el timeout de 30 s de gunicorn.
- Resultado incierto del cobro: un timeout responde 502 "intenta de nuevo" aunque la transacción pudo crearse.
- Aprobación tardía sobre un pedido cancelado: reembolsar o reactivar (hoy sólo se alerta).
- Cooldown de 24 h de correos de estado: hoy descarta, no posterga.
- Staff frente a superusuario en la gestión de usuarios.
- Checkout de invitado con el correo de una cuenta registrada.
- `has_corazon` sin validar contra el peluche; huella de texto vacía se acepta y se cobra.
- Medios ya guardados con nombre predecible (sin renombrar).
- Dos subidas simultáneas en el peor caso de imagen: limitar la frecuencia de subidas anónimas.
- Extender 16 px al resto de formularios; menú móvil del Header (Escape, foco, cruce de breakpoint).
- El gate de CI no instala ruff; PyJWT 2.13 con advisory aplicable de bajo impacto (GHSA-8wjv-2p76-3863).

## Ronda transversal por frentes — 2026-10-08

- Seguridad: privacidad de reseñas, autorización staff de ventas y protección
  de textos exportados contra fórmulas CSV.
- Mantenibilidad: rechazo de imágenes sin persistencia parcial, escrituras
  anidadas atómicas y anticipo frontend conforme al redondeo del servidor.
- Observabilidad: timeout SMTP configurable y conservación del pago confirmado
  ante un fallo del correo.
- Rendimiento: consultas constantes al serializar respuestas PATCH de pedidos
  con uno o cincuenta artículos.
- Responsividad: menú administrativo móvil hasta 1024 px, condicionado a la
  reproducción a 835 px y la matriz/rotación en navegador.
- QA: controles reales del carrito, checkout pendiente/rechazado y job MySQL
  para doce casos de concurrencia sin omisiones.
- Cierre: QA combinada, PR por rama, merge-queue de esta ronda y comprobación
  all-in-base. El estado exacto se consulta en el reporte del toolkit de
  `improvement-20261008-orchestrated-r2`.

Descartados por retorno insuficiente: extraer fórmulas equivalentes o políticas
JPEG coincidentes sin fallo demostrado, ampliar logs sin una necesidad de
diagnóstico y cambiar concurrencia de imágenes sin medición del cuello de botella.
Pendientes separados: redirección bancaria, entrega durable del correo,
rotación JWT, accesibilidad adicional del drawer y PATCH de precios anidados
con campos omitidos. No se añaden a la implementación de esta ronda.

## Ronda orquestada de integridad — 2026-10-08

- Códigos de cuenta: presupuesto persistente por cuenta/propósito, reenvío que
  conserva límites e invalida códigos anteriores (`I-S-d69e950b3187`).
- Pagos: transición bloqueada y conjunta, callbacks tras commit y conservación
  de aprobaciones frente a respuestas o intentos atrasados (`I-O-8c2889fcadd4`).
- Personalizaciones: compra y limpieza coordinadas con las filas actuales,
  rechazo sin pedido parcial y retención ante fallo de storage
  (`I-O-a19669ea9276`).
- Las pruebas de autoría usan MySQL scratch; QA combinada y entrega exacta se
  consultan en el registro `improvement-20261008-orquestada` del toolkit.
- La migración aditiva `0016_passwordcode_attempt_budget` se aplica por deploy.

Ruta de mejoras futuras con retorno, fuera del cupo de esta ronda:

1. Corroborar nginx instalado y cerrar también URLs antiguas de personalización.
2. Definir redirección bancaria antes de retirar polling que convierte pendientes
   sin URL en error; conservar compatibilidad PSE/Bancolombia.
3. Evitar escrituras parciales de categorías y productos, y alinear redondeo.
4. Acotar las lecturas de respuesta PATCH de pedidos con precarga posterior al
   cambio de historial.
5. Corregir overlay, scroll y foco del menú al cambiar de ancho o usar teclado;
   medir sidebar administrativo con una sesión o entorno aislado válido.
6. Reescribir pruebas inoperantes de cantidades/carrito y probar los rechazos
   visibles de envío de pago.

Extraer fórmulas equivalentes, políticas JPEG coincidentes o capas nuevas por
estilo quedó descartado por retorno insuficiente. Los callbacks y el orden de
bloqueos tienen contrato documentado para evitar reintroducir las carreras.

## Privacidad de pedidos e imágenes — 2026-10-02

- [x] Autorizar archivos de personalización por dueño real o capacidad firmada (`I-S-fcb336acb752`).
- [x] Proteger pedidos/pagos y recuperar acceso por correo con vigencia de treinta días (`I-S-a6d59f7cee05`).
- [x] Conservar hero vigente hasta confirmar reemplazo (`I-O-b317b11765b0`).
- Validación conjunta: permisos, efectos antes de autorización, consumo/límites,
  concurrencia MySQL, fallos de storage/DB, recuperación del carrito y cinco anchos.
- Entrega de esta sesión: PR propio abierto hacia `main`, CI del último commit
  en verde y evidencia tipada de la ronda en el toolkit. Sin merge ni deploy.
- Pendientes fuera del cupo: transiciones/polling de pagos, carrera de limpieza
  de archivos, lecturas PATCH, persistencia de categorías y navegación responsive.

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
