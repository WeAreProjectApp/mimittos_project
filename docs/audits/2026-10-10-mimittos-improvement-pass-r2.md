# Segunda ronda transversal dirigida de MIMITTOS — 2026-10-10

## Alcance y estado

Ronda `improvement-20261010-r2`. Snapshot diagnosticado:
`bf897e10a1d9336e84e9e9bbdc4f07a8dead5ea5`, base `main`.
**QA de aplicación: APPROVED** para los tres candidatos sobre
`160beb3bd70b1dd5b22c9a9b3d70def2464d1972`: 65 backend, 18 unit y 19 E2E
(102 casos sin fallos/skips), más gate estricto. El cierre incorpora después
una corrección obligatoria del caso de retroceso que bloqueó CI. Su ejecución
útil y la aceptación del árbol final documental/pruebas/CI siguen pendientes.
No se acredita merge ni despliegue.
No sobrescribe `2026-10-10-mimittos-improvement-pass.md`.

El conductor seleccionó tres causas. El pin compartido se entregó en
`107e7f2`; informó Django 6.0.9 instalado en el venv de pruebas y pip check
verde. La versión instalada no sustituye probar el parser y la aplicación.

| ID | Causa y contrato seleccionado | Propiedad |
|---|---|---|
| `I-S-271c810dfba7` | Django 6.0.9; multipart con header adversarial sin archivo devuelve 400 sin nuevas filas/archivos; imágenes válidas con boundary normal, entrecomillado o filename Unicode devuelven 201 y capacidad correcta. | Pin: compartido; pruebas de medios: Seguridad. |
| `I-M-92a9cae19e6f` | Staff puede leer, modificar y descartar borradores; públicos/clientes conservan 404 para inactivos. El detalle staff expone `is_active`; reabrir false conserva la casilla desmarcada. | Mantenibilidad: vista/serializer catálogo, PeluchForm y API/Jest/E2E correspondientes. |
| `I-O-ffdd56735eed` | Ambos caminos signup devuelven 503 cuando el envío devuelve False, conservan cuenta pendiente, código y presupuesto; mantienen 429 inmediato y éxito 200/201. | Observabilidad: auth, API auth y E2E auth. |


## Decisión de los seis frentes

| Frente | Decisión de diagnóstico | Alcance y retorno |
|---|---|---|
| Seguridad | VALE LA PENA; seleccionada | Multipart Django 6.0.9, causa `I-S-271c810dfba7`. |
| Mantenibilidad | VALE LA PENA; seleccionada | Staff recupera continuación, publicación y descarte de borradores; causa `I-M-92a9cae19e6f`. |
| Observabilidad | VALE LA PENA; seleccionada | Signup informa envío no confirmado conservando recuperación; causa `I-O-ffdd56735eed`. |
| Rendimiento | NO VALE LA PENA esta ronda | Detalle de catálogo carece de beneficio medido suficiente para justificar optimización. No demuestra suficiencia global ni rendimiento adecuado de todos los procesos. |
| Responsividad | VALE LA PENA; pendiente por cupo | Inputs auth a 14 px frente a 16 exigidos y algunos objetivos de 20 px frente a 44 exigidos; MEDIO/BAJO/BAJO. No se descarta por retorno ni se acredita validación viva. |
| QA | VALE LA PENA | Validación obligatoria de las tres causas aplicada y aprobada en `160beb3`: backend/unit/E2E/gate; corrección adicional obligatoria de navegación CI con verificación final pendiente. Endurecer resultado visible de categorías es MEDIO/BAJO/BAJO, elegible pero pendiente por cupo. |

El máximo global de tres causas restringe la selección; no transforma los
candidatos restantes en bajo retorno. Responsividad conserva evidencia de
estilos en sign-in/sign-up/forgot-password del snapshot diagnóstico, sin
bounding boxes ni prueba viva de anchos. Categorías conserva evidencia en
`backoffice-category-crud.spec.ts:135,177`: termina al ver el request sin
comprobar cambio/desaparición de fila; su mejora no se implementa aquí.

Descartes reales: optimizar detalle de catálogo sin medición suficiente,
refactors cosméticos sin fallo concreto y reintentos SMTP automáticos con ACK
incierto, por su riesgo de duplicar correos. No se añade una outbox ni se
promete entrega durable.

Mensaje exacto de 503: «No pudimos confirmar el envío del código. Tu cuenta
sigue pendiente de verificación. Espera al menos un minuto antes de volver
a intentarlo.» No se añaden reintentos automáticos ni se altera el reenvío
genérico. La verificación conserva la contraseña nueva del dueño del correo.

Evidencia del diagnóstico: el lookup original exigía activo en
`backend/base_feature_app/views/catalog.py:315-324`; el DTO de detalle no
incluía el estado en `serializers/catalog.py:210-220`; PeluchForm reabría
siempre con true (`frontend/components/admin/PeluchForm.tsx:217`). Signup
ignoraba el retorno del envío en `backend/base_feature_app/views/auth.py:68,92`.
Estas referencias son del snapshot diagnosticado y pueden desplazarse.

## QA necesaria y límites por capa

| Capa | Comprobación mínima | Bug que debe detectar |
|---|---|---|
| Backend multipart | Header adversarial acotado: 400 y preservación de fila/archivo previo; tres variantes válidas: decodificación real, 201, URL y token firmado; bytes inválidos: 400; regresiones de límite. | Parser/upload que rechaza entradas válidas o persiste medios cuando rechaza. No se exige benchmark temporal. |
| Backend borrador | GET/PATCH/DELETE por staff/cliente/anónimo sobre inactivo; activo conserva acceso y permisos. Crear borrador, subir foto multipart real, publicar o eliminar; detalle staff contiene false y público conserva su contrato. Mantener incremento del contador existente. | 404 del propio borrador, publicación accidental o apertura de inactivos al público. |
| Unit formulario | Existing false deja casilla desmarcada y envío false; campo ausente conserva fallback true. | Reabrir publica sin decisión del administrador. |
| E2E borrador | Primera foto, segunda subida y guardar; cancelar tras foto; reabrir desmarcado y guardar sin publicar. Valores/payload/navegación concretos. | La UI pierde slug/estado, no completa acciones o publica contra la casilla. |
| Backend signup | Nueva/pendiente con envío False: 503, una llamada, cuenta/código/presupuesto conservados; 429 inmediato; éxito después de un minuto; código del intento fallido admite verificación válida con new_password. | Afirmación falsa de envío, reintento que consume o reinicia presupuesto y pérdida del camino de verificación. |
| E2E signup | Formulario válido y términos; 503 muestra error, conserva datos y no muestra código; 429 inmediato; después de un minuto y 200 avanza a verificación. | El cliente afirma envío o queda bloqueado ante un rechazo recuperable. |
| Gate | Reglas estrictas y severidad de CI sobre los archivos tocados; baseline sin cambios. | Tests sin señal o checks eludidos. |

Django se prueba con APIClient **real** y BD scratch. Playwright ejecuta la
**UI real** con la API simulada en su frontera HTTP. No se afirma integración
navegador–Django ni se añade un servidor backend permanente para los specs.
No se acreditan pago real, rendimiento medido, monitoring vivo o producción.

Aislamiento compartido informado por el conductor:
`/tmp/mimittos-improvement-10102026-r2/improvement_r2_settings.py` y venv
`/tmp/mimittos-improvement-10102026-venv`. Settings impiden leer el .env
productivo; SQLite scratch, MEDIA temporal, correo locmem y Huey en memoria.
Las fronteras CAPTCHA/SMTP se controlan en pruebas. No se ejecutan
migraciones operativas, seeds, SMTP externo o pagos.

El harness del conductor vive gitignored en su worktree de integración:
importa la configuración Playwright con `webServer:[]`, inicia Next del SHA
final en puerto aislado y registra cwd/SHA/PID. La configuración tracked fija
8000/3001; `PLAYWRIGHT_BASE_URL` sólo cambia baseURL y `E2E_REUSE_SERVER`
no se consume (`frontend/playwright.config.ts:19-46`). No reutilizar un
servidor ajeno o de otro SHA ni modificar configuración global versionada.

## Auditoría dirigida de flujos

`e2e-user-flows-check` revisa únicamente signup y ciclo de borrador. Se
conservan IDs/outcomes existentes: `auth-sign-up-form`,
`backoffice-peluch-create-draft-on-color-upload`,
`backoffice-peluch-create-cancel-discards-draft` y `backoffice-peluch-edit`.
Las descripciones distinguen el 503/429/recuperación, la publicación según
casilla y la vuelta al listado. Se revisaron los specs y aplicación del tren
`160beb3bd70b1dd5b22c9a9b3d70def2464d1972` después del ajuste de selectores
y Ruff; el índice narrativo acredita únicamente la aceptación de aplicación
de ese SHA. Se actualiza además la descripción del ID existente
`home-to-catalog` para el caso de retroceso aprobado; no se amplía el catálogo. Multipart
adversarial pertenece a integración backend, sin nuevo flujo E2E.

El audit inicial de la rama documental daba 38 specs, 148 tests, 104 flows:
68 covered, 33 partial, tres exempt, cero junk-only; freshness exit 0. Tras
leer aplicación/specs del tren `160beb3`, audit estático exit 0: 38 specs,
151 tests, 104 flows, 69 covered, 32 partial, tres exempt, cero junk-only.
Signup tiene crédito estático de sus cuatro outcomes; edit conserva gaps
anteriores de error/failure. Creación/descarte conservan mocks controlados.
Estos créditos no demuestran ejecución ni persistencia backend.

Freshness sobre ese tren devuelve exit 1: los cambios posteriores del
formulario y tests de catálogo tienen fecha más nueva que el mapa. Se
preserva el aviso heurístico; la lectura dirigida contrastó esos cambios,
incluidos selectores/Ruff, con los contratos de los cuatro IDs. El cierre
requiere integrar esta actualización y repetir freshness sobre esa combinación.
Artefactos propios: `flow-audit-integration-160beb3.json` y
`flow-freshness-integration-160beb3.json` bajo
`test-results/improvement-20261010-r2/`; no se escribieron outputs en el tren.
Las seis clases de módulos históricamente sin outcomes negativos permanecen
fuera de la auditoría dirigida. Tags/conteos no certifican madurez global.

## Evidencia recibida

| Fuente | Commit/artefactos | Resultado y alcance |
|---|---|---|
| Compartido | `107e7f2` | Conductor informó pin Django 6.0.9, instalación y pip check verde. |
| Autor Seguridad | `81f6dd8fe76218d76455a57dbd68d71bed935c67`; `test-results/improvement-20261010-r2/security-author-final.xml`, `.log` y `security-author-verification.md` en su worktree | XML leído: ocho casos, cero fallos/errores/skips; Django 6.0.9 aislado. Es autoría; repetir en la combinación. |
| Autor Mantenibilidad | `f1ebabed957b8258dc0c56395322ec81259b060e`; `test-results/improvement-20261010-r2/backend-drafts.xml` y `backend-permissions.xml` en su worktree | XML de autoría leídos: trece y quince casos, cero fallos/errores/skips. El conductor comprobó que limpieza de Ruff conservó las 70 assertions mediante AST; aceptación combinada abajo. |
| Autor Observabilidad | `64d08875fc47296836f8aeed2ef160ac69e943a1`; `test-results/improvement-20261010-r2/observabilidad-backend-new.xml` y `observabilidad-backend-regression.xml` en su worktree | XML de autoría leídos: diez nuevos y diecinueve de regresión, cero fallos/errores/skips. E2E no ejecutado en esa autoría; aceptación combinada abajo. |
| Verifier de aplicación | `160beb3bd70b1dd5b22c9a9b3d70def2464d1972` | APPROVED los tres candidatos: backend 65, unit 18, E2E 19. Empaquetado del manifest se corrige sin repetir pruebas ni cambiar resultados. |

Slice Seguridad: `test_upload_media_rejects_missing_file_with_separator_heavy_header`,
`test_upload_media_accepts_raw_multipart_image` (tres casos),
`test_upload_media_rejects_invalid_image_bytes`,
`test_upload_media_rejects_file_over_size_limit` (dos casos) y
`test_upload_media_accepts_image_at_size_limit`: ocho casos en total.
Ruff de autoría sólo informó RUF100 sobre noqa previo; no se incorpora ese
ignore como política final: corresponde verificar el gate canónico completo.


## Resultados de la combinación por candidato

SHA limpio servido/probado informado por el conductor:
`160beb3bd70b1dd5b22c9a9b3d70def2464d1972`. Se leyeron directamente los
XML/JSON siguientes desde
`/home/dev_env/webapps/.wt/mimittos_project/queue-improvement-r2-20261010`.
Las rutas de la tabla son relativas a ese worktree y sus archivos son
artefactos locales, no archivos versionados del informe.

| Candidato | Artefacto | Resultado |
|---|---|---|
| `I-S-271c810dfba7` | `test-results/improvement-20261010-r2/qa-media.xml` | 8 ejecutados; 0 fallos/errores/skips. |
| `I-M-92a9cae19e6f` | `test-results/improvement-20261010-r2/qa-catalog-drafts.xml` y `qa-catalog-permissions.xml` | 13 y 15 ejecutados; 0 fallos/errores/skips. |
| `I-M-92a9cae19e6f` | `frontend/test-results/improvement-20261010-r2/qa-peluch-form.json` y `qa-peluch-form.junit.xml` | Jest 18/18, success=true, sin omitidos. JUnit es conversión mecánica del JSON, no otra ejecución. |
| `I-O-ffdd56735eed` | `test-results/improvement-20261010-r2/qa-auth-new.xml` y `qa-auth-regression.xml` | 10 y 19 ejecutados; 0 fallos/errores/skips. |
| Los tres | `test-results/test-quality-report.json` | Gate passed: 6 archivos, 137 tests estáticos, 0 errores/infra, 8 warnings y 6 info; strict, external-lint run, Ruff/ESLint ok con 0 findings. No equivale a 137 tests ejecutados. |
| Mantenibilidad/Observabilidad | `frontend/test-results/improvement-20261010-r2/test-results/improvement-20261010-r2/qa-e2e-localhost-final.json` | JSON nativo leído: 19 expected, 0 unexpected/skipped/flaky, errors vacío; dictamen Verifier APPROVED. Log en `frontend/test-results/improvement-20261010-r2/qa-e2e-localhost-final.log`. |

Architect cerró el requisito de selectores; Auditor dictaminó KEEP para todas
las pruebas tras corregir el título señalado. Ambos son revisión de calidad;
no sustituyen pruebas ejecutadas ni la validación del gate.

El primer E2E contra `127.0.0.1` falló por aislamiento del harness: las cookies
staff estaban asociadas a localhost. Se conservan
`frontend/test-results/improvement-20261010-r2/qa-e2e-127-failure.log` y
`playwright-artifacts-127-failure/`, sin borrar ni contar ese intento como verde.
El conductor corrigió baseURL a `http://localhost:3102`; el JSON de procedencia
`frontend/test-results/improvement-20261010-r2/next-provenance.json` confirma
SHA `160beb3`, cwd del frontend integrado y PID 234275. El re-run de las dos
specs pasó los 19 casos con ese hostname; el intento fallido y sus traces
permanecen como evidencia de diagnóstico, sin reemplazar resultados.

Los nueve E2E auth y el gate focal previos sobre
`577fcbcb66c598e6f62516aebfab83bd85564e26` no se reciclan como aceptación del
SHA actual. Estado CI comunicado por el conductor antes de este cierre:
PR #105 compartido, #106 Seguridad, #108 Mantenibilidad y #109 QA verdes en
sus HEADs de entonces; #107 Observabilidad rojo por navegación. Un nuevo
HEAD requiere comprobar su propio CI: este informe no presume ese resultado.

## Corrección obligatoria de navegación que bloqueó CI

Autorización adicional acotada: sólo `should use browser back button correctly`
en `frontend/e2e/app/user-flows.spec.ts`. Impacto ALTO, esfuerzo BAJO y riesgo
BAJO: desbloquea una comprobación CI real y elimina un camino de falso verde.
Es validación obligatoria de la ronda, no una cuarta mejora de aplicación.

[Run CI 38064401813, job 114249006054](https://github.com/WeAreProjectApp/mimittos_project/actions/runs/38064401813/job/114249006054):
falló en tres intentos. El Verifier contrastó trace retry1: doce tarjetas,
click y recursos RSC de detalle, pero ningún requisito de haber llegado a
la URL de detalle antes de goBack. El primer back termina en Inicio.
Observabilidad comprobó que ese código era idéntico a la base y no usa
signup. Su verde local previo tenía count=0: no hacía click ni retroceso.
No se acredita ese intento como ejecución útil.

Cambio: exigir primera tarjeta visible; quitar conditional; click y assert
URL de detalle antes de retroceder; después exigir catálogo e Inicio.
Nombre/tags/excepciones de selector se conservan. No se cambian los otros
casos, helpers, mocks, config, aplicación ni límites de timeout.

Verificación de esta autoría: diff check y AST con parser Babel del tren;
los otros tres casos permanecen idénticos, nombre/tags del target idénticos,
sin IfStatement y espera de tarjeta/URL antes del primer goBack. Gate focal
strict, junk-severity error: un archivo, cuatro tests estáticos, cero
errores/warnings/info/infra; external-lint off por dependencias locales
no instaladas. Artefactos propios `qa-browser-back-static-gate.json` y `.log`
bajo `test-results/improvement-20261010-r2/`. El gate completo del árbol
final debe ejecutar Ruff/ESLint; no se relaja configuración/baseline.

No se ejecuta Playwright en paralelo ni se añade backend permanente. El
runtime del conductor no aporta catálogo real útil a este caso sin sus
fixtures scratch; la ejecución útil del caso corregido queda al tren/CI.
No se lo cuenta entre los 102 casos aprobados del SHA anterior.

## Solicitudes al orquestador

1. Integrar corrección obligatoria de navegación y cierre documental; fijar
   nuevo SHA40 limpio y ejecutar el caso de retroceso con catálogo útil en
   scratch/CI. Revalidar comprobaciones afectadas y freshness/gate completo
   del árbol final; los autores no absorben cambios ajenos.
2. Verifier ejecuta archivos/nodos explícitos: máximo veinte casos por lote,
   tres comandos por ciclo y dos specs E2E por llamada. Separar backend
   multipart, catálogo y auth; unit del formulario; los dos ámbitos E2E;
   gate estricto. Ninguna suite completa local.
3. Registrar comando, resultados reales, JUnit/Playwright JSON/gate, procedencia
   de Next y relación por candidato en manifest de la carpeta gitignored del
   worktree integrado. Si hay fix, repetir capa afectada sobre nuevo SHA.
4. Conservar pendiente la aceptación del árbol final y su CI hasta comprobar
   esa evidencia; CI/PR corresponden al conductor. La aprobación de los tres
   candidatos sobre `160beb3` no cubre automáticamente el nuevo caso corregido
   ni un SHA posterior. No confundir autoría, aplicación y cierre de entrega.

Fuera del cupo: categorías y responsividad conservan su valor y no reciben
autoría. Wompi PSE/Bancolombia PENDING sin URL y polling que puede exceder
timeout siguen esperando decisión de negocio; no se afirma outage productivo. No repetir compra principal, contraseña nueva o errores por
línea ya corregidos y validados en la primera ronda. El cupo no prueba
suficiencia global. Ningún agente escribe o publica ledger/toolkit desde aquí.
