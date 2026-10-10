# Segunda ronda transversal dirigida de MIMITTOS — 2026-10-10

## Alcance y estado

Ronda `improvement-20261010-r2`. Snapshot diagnosticado:
`bf897e10a1d9336e84e9e9bbdc4f07a8dead5ea5`, base `main`.
**QA de la combinación: PENDIENTE.** Este informe registra contratos,
propiedad, comprobaciones estáticas y evidencia de autoría identificada;
no acredita todavía aceptación del SHA combinado, CI, merge ni despliegue.
No sobrescribe `2026-10-10-mimittos-improvement-pass.md`.

El conductor seleccionó tres causas. El pin compartido se entregó en
`107e7f2`; informó Django 6.0.9 instalado en el venv de pruebas y pip check
verde. La versión instalada no sustituye probar el parser y la aplicación.

| ID | Causa y contrato seleccionado | Propiedad |
|---|---|---|
| `I-S-271c810dfba7` | Django 6.0.9; multipart con header adversarial sin archivo devuelve 400 sin nuevas filas/archivos; imágenes válidas con boundary normal, entrecomillado o filename Unicode devuelven 201 y capacidad correcta. | Pin: compartido; pruebas de medios: Seguridad. |
| `I-M-92a9cae19e6f` | Staff puede leer, modificar y descartar borradores; públicos/clientes conservan 404 para inactivos. El detalle staff expone `is_active`; reabrir false conserva la casilla desmarcada. | Mantenibilidad: vista/serializer catálogo, PeluchForm y API/Jest/E2E correspondientes. |
| `I-O-ffdd56735eed` | Ambos caminos signup devuelven 503 cuando el envío devuelve False, conservan cuenta pendiente, código y presupuesto; mantienen 429 inmediato y éxito 200/201. | Observabilidad: auth, API auth y E2E auth. |

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
Las descripciones distinguen el 503/429/recuperación y la publicación según
casilla; el índice narrativo mantiene aceptación pendiente. Multipart
adversarial pertenece a integración backend, sin nuevo flujo E2E.

El audit/freshness estático de la rama documental mide el corpus base,
no las autorías aún sin integrar. Freshness: exit 0. Audit: 38 specs, 148 tests, 104 flows; 68 covered,
33 partial, tres exempt y cero junk-only. Signup sigue partial sin failure;
edit sigue partial sin error/failure. Creación/descarte reciben crédito
estático del corpus base con mocks; eso no prueba el backend del borrador.
Sus resultados se conservan en `flow-freshness.json` y
`flow-audit-documentation.json` dentro de
`test-results/improvement-20261010-r2/` de la rama QA. Conteos de scanner,
tags, autoría o documento no demuestran ejecución ni la cobertura efectiva
del SHA final. La revisión dirigida conserva brechas ajenas a estos flujos.

## Evidencia recibida

| Fuente | Commit/artefactos | Resultado y alcance |
|---|---|---|
| Compartido | `107e7f2` | Conductor informó pin Django 6.0.9, instalación y pip check verde. |
| Autor Seguridad | `81f6dd8fe76218d76455a57dbd68d71bed935c67`; `test-results/improvement-20261010-r2/security-author-final.xml`, `.log` y `security-author-verification.md` en su worktree | XML leído: ocho casos, cero fallos/errores/skips; Django 6.0.9 aislado. Es autoría; repetir en la combinación. |
| Autor Mantenibilidad | `849c0f8230f87a8e79a4b347215dee1e127aed06`; `test-results/improvement-20261010-r2/backend-drafts.xml` y `backend-permissions.xml` en su worktree | XML leídos: trece y quince casos, cero fallos/errores/skips. Jest/E2E pendientes; repetir backend en la combinación. |
| Autor Observabilidad | `64d08875fc47296836f8aeed2ef160ac69e943a1`; `test-results/improvement-20261010-r2/observabilidad-backend-new.xml` y `observabilidad-backend-regression.xml` en su worktree | XML leídos: diez nuevos y diecinueve de regresión, cero fallos/errores/skips. E2E nuevo pendiente; repetir backend en la combinación. |
| Verifier combinado | SHA/manifest pendiente | Debe ejecutar todas las capas necesarias sobre el commit limpio integrado. |

Slice Seguridad: `test_upload_media_rejects_missing_file_with_separator_heavy_header`,
`test_upload_media_accepts_raw_multipart_image` (tres casos),
`test_upload_media_rejects_invalid_image_bytes`,
`test_upload_media_rejects_file_over_size_limit` (dos casos) y
`test_upload_media_accepts_image_at_size_limit`: ocho casos en total.
Ruff de autoría sólo informó RUF100 sobre noqa previo; no se incorpora ese
ignore como política final: corresponde verificar el gate canónico completo.

## Comprobación final y solicitudes al orquestador

1. Integrar exclusivamente las autorías y este diff documental; fijar SHA40
   limpio con aplicación/tests/pin. Los autores no absorben cambios ajenos.
2. Verifier ejecuta archivos/nodos explícitos: máximo veinte casos por lote,
   tres comandos por ciclo y dos specs E2E por llamada. Separar backend
   multipart, catálogo y auth; unit del formulario; los dos ámbitos E2E;
   gate estricto. Ninguna suite completa local.
3. Registrar comando, resultados reales, JUnit/Playwright JSON/gate, procedencia
   de Next y relación por candidato en manifest de la carpeta gitignored del
   worktree integrado. Si hay fix, repetir capa afectada sobre nuevo SHA.
4. Conservar la aceptación pendiente hasta comprobar esa evidencia; CI/PR
   final corresponden al conductor. QA puede actualizar este reporte después
   sin confundir resultados de autoría con aceptación combinada.

Fuera del cupo: retorno visible de editar/borrar categorías sigue elegible
MEDIO/BAJO/BAJO, sin autoría; Wompi/polling bancario está aplazado; responsive
no se modifica. No repetir compra principal, contraseña nueva o errores por
línea ya corregidos y validados en la primera ronda. El cupo no prueba
suficiencia global. Ningún agente escribe o publica ledger/toolkit desde aquí.
