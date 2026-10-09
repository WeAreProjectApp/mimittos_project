---
trigger: manual
description: Current work focus, recent changes, active decisions, and next steps for Mimittos.
---

# Active Context — Mimittos

## Ronda transversal r3 — 2026-10-09

La ronda `improvement-09102026-r3` diagnosticó seis frentes sobre `origin/main`
`a7629e9` y aplicó sólo lo que superó el umbral (impacto ALTO, o MEDIO con
esfuerzo y riesgo BAJO), con una rama por frente y un dueño por archivo.

Seguridad acota la subida pública de medios, la guarda con nombres aleatorios
y revoca las sesiones JWT al cambiar la contraseña (re-login único aceptado por
el operador). Rendimiento acota la decodificación de audio a 30 s y de imágenes
por píxeles, y acepta notas de voz `.opus`. Observabilidad impide cobrar pedidos
que ya no esperan pago, alerta aprobaciones que el pedido no puede recibir y
separa los 400 de negocio de los 500 internos del checkout. Mantenibilidad hace
que checkout entienda los errores por línea de DRF 3.18. Responsividad lleva a
16 px los campos de compra. QA prueba el cobro y guardado de la personalización,
reescribe dos E2E sin aserción efectiva y cubre el pago rechazado.

Decisiones: montos de pago completo (correos, Mis pedidos, KPIs y CSV muestran
el abono) pospuestos por el operador; ciclo de vida del menú móvil diferido.

## Ronda transversal por frentes — 2026-10-08

La ronda `improvement-20261008-orchestrated-r2` trabaja en ramas y worktrees
separados por frente. El operador autorizó hasta tres mejoras por frente y
la integración exclusiva de esta ronda mediante merge-queue.

Seguridad elimina el correo de las reseñas públicas, identifica la propia con
`is_mine`, reserva las lecturas de ventas a staff y neutraliza fórmulas en los
textos del CSV. Mantenibilidad conserva categorías cuando falla una imagen,
hace atómicas las escrituras anidadas de peluches y alinea el redondeo al par
del frontend con el cobro del servidor. Rendimiento precarga las relaciones
de la respuesta después de modificar un pedido.

La configuración compartida limita SMTP a diez segundos por defecto mediante
`DJANGO_EMAIL_TIMEOUT`. El job MySQL ejecuta diez escenarios de concurrencia
que expanden doce casos; exige motor MySQL, ejecución completa y cero skips.
QA reemplaza las pruebas inoperantes del carrito y retiene una respuesta HTTP
para comprobar bloqueo y recuperación del checkout.

Responsividad corrige el breakpoint administrativo tras reproducir el sidebar
fijo a 835 px. La aceptación requiere la matriz canónica de cinco anchos,
rotación y una QA combinada sobre el commit limpio. Pruebas, artefactos,
calificaciones y estado de entrega se registran en el reporte del toolkit:
`docs/audits/2026-10-08-mimittos_project-improvement-pass-project-improvement-20261008-orchestrated-r2.md`.

Continúan fuera del alcance el contrato de redirección bancaria, una outbox
durable de correo, cambios de rotación JWT sin diagnóstico completo y mejoras
de teclado/foco del drawer. El PATCH de precios anidados incompletos conserva
un fallo preexistente; el formulario actual envía los campos completos.

## Integridad de cuentas, pagos y personalizaciones — 2026-10-08

La ronda orquestada `improvement-20261008-orquestada` seleccionó tres causas:
presupuesto persistente e invalidación de códigos de cuenta, asentamiento
atómico e idempotente de pagos y coordinación entre compra y limpieza de
medios. Seguridad y observabilidad implementaron exclusivamente sus archivos;
el conductor aporta la migración aditiva y esta documentación.

El esquema añade `PasswordCodeAttemptBudget` por usuario y propósito. Los
límites y la vigencia se describen en `docs/methodology/architecture.md`.
La migración pertenece al despliegue; las pruebas de la ronda usan bases
MySQL scratch aisladas.

Orden de bloqueos: usuario antes de presupuesto de código; pedido antes de
transacción de pago; medios en orden estable de ID. Las notificaciones salen
tras el commit. Las aprobaciones válidas entre intentos de pago no se
descartan por llegar antes de la respuesta HTTP de creación del intento.

Pruebas de autoría: seguridad 56 casos únicos; observabilidad 50 ejecuciones
sobre el contenido corregido, incluidas carreras MySQL y webhooks firmados.
La aceptación combinada y la entrega se registran en el reporte de la ronda
del toolkit y sus PR; no se confunden con esas pruebas de autoría.

Persisten candidatos fuera del cupo: acceso directo a personalizaciones según
nginx registrado, polling bancario, escrituras parciales de catálogo,
redondeo del frontend, lecturas PATCH y navegación pública. La revisión de
todos los frentes fue dirigida, no una certificación global de madurez.

## Ronda de privacidad — 2026-10-02

La sesión `improvement-order-privacy` trabaja desde `main` en un worktree propio.
Su alcance autorizado son tres causas: referencias de personalización sin
autorización, lecturas de pedidos/pagos protegidas sólo por el número comercial
y eliminación del hero vigente antes de confirmar su reemplazo.

El operador definió recuperación mediante código por correo antes de mostrar
datos del pedido y acceso por treinta días. Checkout invitado se conserva con
capacidades firmadas; los códigos de pedidos se separan de los códigos de cuenta.
Las correcciones del PR #78 pertenecen a otra sesión y no se incorporan aquí.
La implementación conserva el carrito al recuperar archivos y guarda el acceso
del pedido antes de navegar al pago. Los enlaces enviados por correo llevan la
capacidad en el fragmento; se retira antes de enviar analytics. La confirmación
consulta información autorizada antes de mostrar el resultado o vaciar el carrito.

La autoría de pruebas ya comprobó códigos de un solo uso, límites por pedido y
reemplazos simultáneos del hero con MySQL scratch y conexiones separadas. Los
casos de concurrencia no se acreditan con SQLite. La validación final y el CI
se registran en una sola ronda sobre el commit limpio, con artefactos en el
worktree y el reporte operativo del toolkit:
`docs/audits/2026-10-02-mimittos_project-improvement-pass-project-improvement-20261002-order-privacy.md`.
La entrega requiere PR abierto y CI verde. No se migra la base del servicio.

## Acceso y limpieza de archivos — 2026-10-02

Rama propia `fix/02102026-improvement-auth-media`, base `main`.
La ronda aprobada corrige el emisor JWT que omite CAPTCHA, separa correo
verificado de bloqueo administrativo y conserva referencias a archivos cuya
eliminación falla. Las cuentas antiguas inactivas permanecen bloqueadas hasta
activación explícita de staff; los códigos anteriores se invalidan porque
no registraban su propósito. La migración se prepara y la aplica el deploy.

QA combinada cubre backend, estado administrativo y flujos de registro/acceso,
con bases y servicios de pruebas aislados. Evidencia de la ronda en el toolkit:
`docs/audits/2026-10-02-mimittos_project-improvement-pass-project-improvement-20261002-auth-media.md`.
La entrega requiere PR abierto con CI verde; sin merge ni deploy.
Autorización de medios, tracking seguro, pagos y rendimiento quedan fuera del
cupo. Para recuperar tracking en una futura ronda se eligió código por correo.

## Listados acotados y directorio de usuarios — 2026-10-01

La ronda transversal amplía el PR #76 en la misma rama de sesión.
El listado y detalle de usuarios requieren staff antes de consultar sus datos.
Los clientes autenticados reciben 403, incluso para un identificador inexistente;
las escrituras mantienen su contrato anterior.

Ventas y pedidos administrativos devuelven `count`, `next`, `previous` y
`results`, con páginas predeterminadas y máximas de 100 registros. Ventas
conserva su acceso existente; pedidos sigue reservado a staff y aplica sus
filtros antes de paginar. La pantalla muestra el total del servidor, permite
avanzar y retroceder y vuelve a página 1 al cambiar el filtro. Una solicitud
reemplazada no publica filas, totales, errores ni estado de carga.

La validación combinada usa SQLite aislada y APIs controladas en un servidor
Next local. Resultados y evidencia de esta ronda:
`docs/audits/2026-10-01-mimittos_project-improvement-pass-project-improvement-20261001-lists-users.md`
en el toolkit. El cierre requiere comprobar CI del último commit del PR,
sin merge ni deploy. Los otros hallazgos permanecen pendientes por cupo o evidencia.

## Rendimiento e Inicio — 2026-09-30

Rama `fix/30092026-perf-home-round`, PR #76 hacia `main`. La creación legacy de
ventas agrupa las lecturas de productos y conserva una línea por entrada, incluso
si se repite el producto. La respuesta reutiliza los productos precargados;
las escrituras y el error por identificador inexistente mantienen su contrato.
Blogs comparte sólo solicitudes simultáneas: un refresco posterior vuelve a consultar.
Los gráficos del dashboard se cargan en un módulo diferido al recibir analytics.

Inicio ajusta el título en móvil y tablet, distribuye reseñas en dos columnas a
835 px y ofrece objetivos táctiles de 44 × 44 px en sus carruseles. Se conserva
el contenido y la navegación. La matriz de aceptación tiene cinco anchuras,
con presets y pruebas en el módulo dueño; el mapa incorpora las preguntas frecuentes.

Las pruebas de esta ronda usan SQLite aislada y respuestas locales controladas.
Build de producción y TypeScript aprobados; la evidencia de presupuestos y QA
se registra en el toolkit. No se certifican memoria total ni latencia MySQL de
producción para ventas sin límite de líneas. La paginación y el rediseño de
escrituras quedan como escalaciones de contrato. Los listados completos de
ventas y pedidos administrativos quedan como candidatos nuevos para otra ronda.
Entrega de sesión: PR abierto con CI verde, comprobado sobre el último commit.

## Rendimiento — ventas y filtros administrativos (2026-09-27)

Rama `fix/27092026-perf-sales-order-filters`, desde main; PR #74.
El detalle de ventas precarga artículos, productos y galerías. Los filtros del
backoffice cancelan consultas reemplazadas; sólo la ejecución vigente puede
actualizar filas, error o carga. La API conserva datos y permisos, y los botones
siguen consultando de inmediato.

QA confirma consultas constantes con productos y galerías distintos,
colecciones vacías, permisos y respuestas fuera de orden. El detalle ejecuta
tres consultas tanto para un artículo como para cincuenta. El nuevo flujo E2E
`backoffice-order-filter` separa este comportamiento del filtro de pedidos del
cliente. Las pruebas usan SQLite temporal y servicios locales con red interceptada.
Pasaron 35 casos distintos: 5 backend, 26 unitarios frontend y 4 E2E; TypeScript
y el gate estricto del lote también pasaron. El auditor aprobó los archivos tocados.

No se garantiza memoria acotada para detalles/listados completos ni cancelación
SQL al abortar el navegador. La paginación requiere otra decisión de contrato.
Registro operativo: toolkit `docs/audits/2026-09-27-mimittos_project-perf-sales-order-filters.md`.
Entrega: PR abierto con CI verde; sin merge ni deploy.

## Rendimiento de blogs, productos y exportación — 2026-09-27

Rama `fix/27092026-perf-blogs-products-export`, PR #73 contra `main`.
Los dos listados de blogs y los dos de productos legacy agrupan bibliotecas y
adjuntos; el serializer histórico de blogs reutiliza el primer adjunto.
El CSV precarga artículos con sus relaciones por bloques de 100 pedidos.
Se conservan respuestas, orden por rank, columnas, BOM y filtros de fecha.

Perfil `vps-projectapp-prod`; caso `conservative`: las respuestas completas y el
CSV final siguen creciendo con el dataset, y el número de artículos por pedido
no está acotado. No se certifica memoria total ni tiempos de producción.
QA backend valida consultas constantes de listados y consultas por bloque en
SQLite aislada, con medios temporales: 16 casos nuevos y 22 regresiones aprobados,
con gate estricto sin errores ni advertencias. La evidencia operativa vive en los
reportes perf/QA de esta ronda en el toolkit; CI vigente en PR #73.

## Limpieza del repositorio — 2026-09-25

Rama `chore/25092026-repo-cleanup`, desde `main` en `3dd5d84`. Auditoría y lote
aprobados por el operador: retirar cinco módulos frontend sin consumidores y sus
cinco tests, dos mocks antiguos y next-intl; ignorar siete salidas del CI.
Se conservan Swiper, BlogCard, blogStore, assets públicos y todo el backend.

Las guías de setup, tests, stack, arquitectura y lecciones se alinearon con el
código y con los servicios de `projects.yml`. La interfaz actual no implementa
el objetivo bilingüe histórico; retirarlo del runtime no cancela ese requerimiento.
El registro de flujos E2E permanece intacto porque no se retira comportamiento
alcanzable. `test:e2e:1` deja de mencionar el spec inexistente smoke.

Validación local: 14 tests Jest aprobados (portada, blogs y catálogo), build Next.js
aprobado, siete exclusiones verificadas y ninguna referencia de código pendiente.
Quality gate: passed, 0 errores, score 100; 16 warnings (Ruff no disponible y
observaciones en specs existentes). ESLint externo pasó. El CI del PR valida las
suites completas antes del squash autorizado por el operador; no se despliega.

## Rendimiento del filtro de precio — 2026-09-25

Ronda `perf-catalog-requests`, PR #70. El precio mostrado se actualiza de inmediato;
las consultas de precio se agrupan tras 300 ms de pausa. Categoría, talla, huella y
orden consultan de inmediato con el precio vigente. La selección anterior se
invalida antes de esperar, y sus respuestas no pueden publicar resultados ni
finalizar la carga vigente. QA valida presupuesto de llamadas, cancelaciones y
contratos; la prueba E2E existente usa el control accesible por teclado.

El lote local pasa 32 pruebas (23 de catálogo y 9 del servicio), con el presupuesto
de una consulta adicional para ráfagas de uno y cincuenta cambios. El spec público
se ejecuta en el entorno aislado de CI; su resultado vigente y el cierre de entrega
se consultan en [PR #70](https://github.com/gustavop-dev/mimittos_project/pull/70).

La concurrencia de subidas queda en diagnóstico: falta un presupuesto canónico de
trabajos activos. No se modifican uploads ni infraestructura. Evidencia operativa
en el toolkit: `docs/audits/2026-09-25-mimittos_project-perf-catalog-requests.md`.

## Rendimiento — KPIs, reseñas y sesión (2026-09-24)

Rama `fix/24092026-perf-kpis-reviews-session`, PR #68 contra `main`, independiente
del PR #67. KPIs usa un agregado condicional; el rating reúne promedio y cantidad
aprobada antes de actualizar; las restauraciones simultáneas comparten una
validación pendiente por sesión. Al cerrar o cambiar sesión se invalida la
restauración anterior. Se conserva el refresco automático de access token.

Presupuestos declarados: KPIs `Q(1)=Q(50)≤1`, rating `Q(1)=Q(50)≤2` incluyendo
la escritura, sesión una validación lógica para consumidores concurrentes. QA
verificado sobre SQLite aislada y Jest, con gate estricto limpio; sin modificaciones de base de datos,
infraestructura, dependencias o flujos de usuario. Perfil: `vps-projectapp-prod`,
según el estándar canónico y el ledger del toolkit.


## Rendimiento de pedidos — 2026-09-24

Rama `fix/24092026-perf-order-batches`, PR #69 hacia `main`. Candidatos
`P-backend-queries-06` y `P-backend-queries-07`: la validación del carrito comparte
consultas por bloques internos y el servicio vuelve a cargar precios disponibles
dentro de `atomic`; Mis pedidos deja de precargar artículos no serializados.
Se conservan contrato, errores DRF por índice, cálculos y escrituras por artículo.

QA aprobada sobre serializers, servicio y vistas de pedidos, con SQLite aislada
como CI: presupuestos, errores, precios actualizados, media e aislamiento
verificados; gate estricto con Ruff limpio y auditoría independiente KEEP.
El caso es `conservative`: acotar públicamente el carrito o paginar el
historial requiere otra decisión de contrato. La evidencia y los presupuestos
viven en el toolkit, reportes `2026-09-24-mimittos_project-perf-order-batches.md`
y `2026-09-24-round3-mimittos_project-qa.md`.
Los PR #67 y #68 corresponden a rondas independientes. Esta sesión entrega PR
abierto con CI verde; no mergea ni despliega.

## Rendimiento de lecturas — 2026-09-24

Ronda catálogo, pedidos y dashboard en `fix/24092026-perf-catalog-orders-dashboard`, PR #67.
El catálogo anota el mínimo disponible sin alterar filtros de precio ni limitar destacados;
las lecturas de pedidos agrupan relaciones y medios opcionales; el dashboard agrega clientes
en SQL y reutiliza resultados diarios exactos. Sin cambios de API, migraciones ni frontend.
QA backend: 18 casos nuevos y 14 regresiones pasaron sobre SQLite aislado. Los presupuestos
comparan una y cincuenta filas, incluyendo precios nulos e historiales con autores distintos.
La ejecución en MySQL y el tamaño/memoria del catálogo sin paginar no están certificados.
Reporte y ledger en el toolkit: `2026-09-24-mimittos_project-perf-catalog-orders-dashboard.md`.
El cierre de QA está en `2026-09-24-mimittos_project-qa.md`; entrega mediante PR #67.

## Monitoreo local — 2026-09-19

Exportación semanal Silk agrupada y sin SQL/valores URL para el módulo de
monitoreo de ProjectApp. Muestreo acotado y cuerpos HTTP deshabilitados; no se
modificó `.env` ni se activó Silk. El rollout pertenece al deploy autorizado y
mantiene el correo. Detalle: `docs/monitoring-export.md`.

Last updated: 2026-08-26

---

## Dependency vulnerability remediation (2026-08-26)

Branch `chore/26082026-vuln-audit`. The frontend dependency audit moved from
10 findings (9 high, 1 low; 6 high in production dependencies) to zero after
patch/minor updates, including Next.js 16.3.3 and Axios 1.20.0. The production
build passes and 57 focused Jest tests cover the fixtures/mocks corrected when a
clean build exposed pre-existing type drift.

The backend audit moved from 44 findings across Django, Pillow, pip, PyJWT, and
sqlparse to 4 findings in sqlparse 0.5.5 only. Django 6.0.8, Pillow 12.3.0, and
PyJWT 2.13.0 contain the applicable fixes. sqlparse 0.6.0 remains a separately
reviewed major transition under the project's 0.x policy; there is no direct
sqlparse import in application code. Backend verification used an isolated
Python 3.12 venv and SQLite: 0 Django check issues, 502 tests collected, and the
8-test smoke slice passed. Full evidence and deferred majors are recorded in
`audit-report.md`.

---

## GTM global + catalog pagination (2026-06-10)

Branch `feat/10062026-gtm-catalog-pagination`. Two changes: (1) Google Tag Manager
(`GTM-K88JC5VS`) added globally in `frontend/app/layout.tsx` — inline script via
`next/script` (`strategy="afterInteractive"`) plus the `<noscript>` iframe right after
`<body>`, so it loads on every route. (2) Client-side pagination on `/catalog`: page
size is responsive via `matchMedia('(min-width: 1024px)')` — 16 products per page on
desktop, 12 on mobile — with Anterior/Siguiente + numbered page controls below the
grid. Changing any filter or sort resets to page 1; page changes scroll back to top.
Flow `catalog-pagination` registered in `docs/USER_FLOW_MAP.md` and
`frontend/e2e/flow-definitions.json` (E2E spec pending — needs seed data with >12
products to be deterministic). Unit tests added in
`frontend/app/catalog/__tests__/page.test.tsx` (10 passing).

---

## Incremental color image upload — draft model (2026-05-21)

Branch `feat/21052026-incremental-color-image-upload`. La creación de peluches en el
backoffice ya no acumula las fotos por color en memoria para subirlas al hacer "Crear":
ahora, al seleccionar la primera foto de un color, se crea de inmediato un peluche
**borrador** (`is_active=false`) vía `peluchAdminService.create`, y desde ahí el formulario
se comporta como modo edición. Cada imagen se sube de a una con estado por imagen
(subiendo / ✓ / ✗ con reintento) y auto-retry de fallos transitorios; el botón "Guardar"
se bloquea mientras haya subidas pendientes o fallidas. "Cancelar" ofrece descartar el
borrador (lo borra vía API). La compresión cliente (`lib/utils/imageCompressor.ts`)
garantiza que cada imagen quede bajo un límite de bytes antes de subir. El listado del
backoffice marca los peluches inactivos con un badge "Borrador". Piezas nuevas:
`lib/utils/imageCompressor.ts` (reescrito), `lib/services/colorImageUpload.ts` (retry),
`lib/hooks/useColorImageUpload.ts` (hook de subida incremental). Cambio de backend
necesario: `is_active` se agregó a `PeluchListSerializer.fields` para que el badge
funcione end-to-end. Spec/plan:
`docs/superpowers/specs/2026-05-21-incremental-color-image-upload.md`,
`docs/superpowers/plans/2026-05-21-incremental-color-image-upload.md`.

---

## Cascade color/size deletion (2026-05-21)

Admins can now hard-delete a global color or size from `PeluchForm`. `PeluchSizePrice.size` is
`CASCADE` and `OrderItem.size/color` are `SET_NULL` (migration `0013`), so deletion is unblocked
and cascades to the catalog while order history survives via `OrderItem.configuration_snapshot`
(`size_label`/`color_name` already stored there). New admin endpoints `GET /colors|sizes/<id>/usage/`
feed real impact counts into a branded SweetAlert2 dialog (`lib/utils/confirmDelete.ts`) that gates
the delete button on typing the exact preset name. Order views fall back to the snapshot via
`lib/utils/orderItemDisplay.ts` when the FK is null. Spec/plan:
`docs/superpowers/specs/2026-05-21-cascade-color-size-deletion-design.md`,
`docs/superpowers/plans/2026-05-21-cascade-color-size-deletion.md`.

---

## Branch `fix/peluche-size-deselection-not-persisting` (2026-05-21)

Fixed the product-detail color/photo mismatch (see `error-documentation.md` ERROR-001). The peluch
serializers (`PeluchListSerializer`, `PeluchDetailSerializer`) no longer emit a separate
`color_images_meta` array — each entry of `available_colors` now carries its own `preview_url`,
`image_count`, and (detail only) `images`. List endpoints omit the full `images` array to keep the
catalog payload light. The lazy per-color `getColorImages` fetch was removed; the detail payload
ships all per-color images at once. Purchase flow untouched: cart/checkout still read the
`CartItem.gallery_urls` snapshot, whose shape is unchanged.

---

## Branch `feat/per-size-pricing` (2026-05-12)

Moved the per-product pricing knobs onto `PeluchSizePrice` so each size is configured independently:
`deposit_percentage`, `full_payment_discount_pct`, `free_shipping`, `shipping_cost` now live on `PeluchSizePrice`
(alongside `price`), not on `Peluch`. `discount_pct` (general always-on discount) stays on `Peluch`.
Migration `0012_per_size_pricing_config` copies each peluche's old values onto all of its size rows, then drops
the four columns from `Peluch`. `OrderService.create_order` reads deposit/discount/shipping per matched size;
everything downstream (`Order` snapshot fields, `WompiTransaction.amount_in_cents`, `wompi_service.py`,
`/payment/*`) is unchanged. Frontend: product detail snapshots the selected size's config onto the `CartItem`
(shape unchanged) and shows that size's "Abono X%"; the backoffice `PeluchForm` edits the four fields per size
row instead of in a global "Pagos y envíos" section. Spec/plan: `docs/superpowers/specs/2026-05-12-per-size-pricing-config-design.md`,
`docs/superpowers/plans/2026-05-12-per-size-pricing-config.md`.

Note: dev DB is now MySQL (`.env`); the `mimittos` user can't create the pytest `test_*` DB, so run backend
tests with `DJANGO_DB_ENGINE=django.db.backends.sqlite3 pytest ...` (the project's original SQLite test setup).

---

## Contexto histórico — 2026-05-01

Stabilizing CI on branch `double-check-30042026`. The 1 failing E2E (`auth-login-invalid`) is fixed and the CI matrix now exercises all 20 e2e spec files — projected 61/61 flow coverage on next CI run.

Pending product decisions from flow audit (2026-05-01) before registering 4 new flows in `flow-definitions.json` / `USER_FLOW_MAP.md`.

---

## Recent Changes (this branch)

| Commit | Change |
|--------|--------|
| `9598e89` | ci(e2e): expand matrix from 4 → 6 shards, every spec file runs |
| `701e083` | fix: http.ts 401 interceptor was refreshing tokens on unauthenticated requests, causing sign-in failures to redirect to home |
| `fdfb66e` | test(e2e): mock `sign_in/` to force deterministic 401 path |
| `5526eb7` | test(e2e): assert non-redirect invariant for invalid credentials |
| `b62eed4` | chore: gitignore coverage artifact files |
| `8e35d85` | ci(quality-gate): trigger on every PR/push, drop paths filter |
| `b05e492` | ci: adopt blob+merge-reports pattern with custom matrix |

---

## Active Decisions

- **Spanish locale is canonical for tests**: All E2E and unit tests assert Spanish-language strings. English translations exist in code but tests don't cover them separately.
- **Wompi uses `id` field**: Wompi transaction responses return `id`, not `transaction_id`. Tests and serializers align with this.
- **E2E flow definitions are the contract**: Every navigable user flow must be registered in `frontend/e2e/flow-definitions.json` and documented in `docs/USER_FLOW_MAP.md` before writing E2E tests.
- **401 interceptor only refreshes when Authorization header was on the request** (`frontend/lib/services/http.ts`) — public endpoints returning 401 (sign_in, sign_up, google_login) reject directly so the page can render the error message.
- **CI E2E matrix is explicit, not glob-based** — each spec file is listed by name in `.github/workflows/ci.yml` to avoid double-runs and to keep shard balance visible.

---

## Architecture State

| Layer | Count |
|-------|-------|
| Backend models | 19 |
| View files (FBV organized by domain) | 16 |
| Service modules | 7 |
| Serializer files | 18 |
| Migrations | 10 |
| Management commands | 13 |
| URL modules | 13 (~60+ paths) |
| Frontend pages (App Router) | 27 |
| Frontend components | 20 |
| Zustand stores | 10 |
| Frontend services (axios + helpers) | 13 |

---

## Next Steps

1. Wait for CI to confirm 61/61 flow coverage on `9598e89`.
2. Get product decisions on flow-audit findings (see `tasks_plan.md` "Flow Audit Findings"):
   - Whether to wire a backend handler for the contact form (or remove the form).
   - Whether to build backoffice blog management UI (or remove the unused endpoints).
   - Whether to register `app-dashboard-access` rename.
3. After decisions: register the 4 new flows in `flow-definitions.json` + `USER_FLOW_MAP.md` and add specs.
4. Expand the 6 partial-coverage specs (CRUD/submit assertions, not just page-render).
5. Merge `double-check-30042026` → `main`.
