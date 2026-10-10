# Tercera ronda transversal dirigida de MIMITTOS — 2026-10-10

## Alcance y estado

Ronda `improvement-20261010-r3`, diagnóstico congelado en
`7bd32780aadd2653117add509c261c62ef0debb4`, base `main`.
Las tres correcciones están implementadas y commiteadas en las ramas de
sus autores. La aceptación combinada sigue pendiente al redactar este
snapshot; se acreditará en el manifest final y el cierre archivado de la
ronda. Este informe no acredita CI remoto, merge o despliegue. La evidencia
de R2 es antecedente: no se reutiliza como ejecución de R3.

El cupo global de tres causas selecciona:

| ID | Contrato aprobado | Dueño de aplicación y pruebas de su capa |
|---|---|---|
| `I-S-608c4c518878` | El login-as autorizado usa un handoff firmado con TTL de 60 segundos en el fragmento; POST `/api/admin-login/handoff/` lo canjea. JWT arbitrarios por query o canje rechazado no sustituyen una sesión válida previa. | Seguridad: emisor, canje, puente, backend y unit. |
| `I-M-faa66af757db` | La confirmación por correo muestra importes persistidos correctos para pago completo y parcial, en texto y HTML; no confirma antes de APPROVED. | Mantenibilidad: notificaciones y pruebas backend/Wompi. |
| `I-O-14fd49c56d59` | DELETE fallido de una foto conserva la miniatura y muestra error; 204 sin cuerpo retira exclusivamente la elegida. | Observabilidad: hook, formulario y unit. |

QA tiene ownership exclusivo de los dos specs E2E dirigidos, registro de
flujos, mapa narrativo y este informe. No implementa aplicación ni amplía
la selección a categorías. El conductor integra/publica; los autores dejan
sus commits en sus propias ramas.

## Implementación entregada por los autores

| Frente | Commit | Pruebas de autoría comunicadas | PR |
|---|---|---|---|
| Seguridad | `e25b70afb4b192b8616cc095dec464b2ee7088cf` | 87 casos: 30 backend y 57 frontend. | [#113](https://github.com/gustavop-dev/mimittos_project/pull/113) |
| Correos | `bfbf0d168cfd2fcef3782c67c5b893edebf09368` | 12 casos backend finales. | [#111](https://github.com/gustavop-dev/mimittos_project/pull/111) |
| Fotos | `98fce72f8dc8298cd42ce9484505130f531db4cb` | 31 casos unit únicos. | [#112](https://github.com/gustavop-dev/mimittos_project/pull/112) |
| QA | `0059f4efff990fef3b31299458d6d6b3ae08776f` | Siete casos E2E escritos; gate, auditoría de contenido y freshness aprobados; ejecución integrada pendiente. | [#114](https://github.com/gustavop-dev/mimittos_project/pull/114) |

Estas verificaciones pertenecen a los SHA de autoría, no al futuro tren
combinado. El conductor aprobó y commiteó en `improve/compartido-r3` la
configuración `FRONTEND_URL=http://localhost:3001` para CI
(`957f692f06fc475bea1bdb87ace1ff28b8c638a3`): el enlace emitido por Django
Admin debe apuntar al puerto real de Playwright. Su beneficio es permitir
verificación real del puente; impacto MEDIO, esfuerzo BAJO y riesgo BAJO.
No introduce una cuarta causa ni cambia dependencias, locks o migraciones.

## Decisión de los seis frentes

Todas las decisiones son de alcance limitado; no certifican madurez global.

| Frente | Estado de diagnóstico | Retorno y selección |
|---|---|---|
| Seguridad | VALE LA PENA | Puente login-as; ALTO/MEDIO/MEDIO, seleccionado. |
| Mantenibilidad | VALE LA PENA | Importe pagado en correo; MEDIO/BAJO/BAJO, seleccionado. |
| Observabilidad | VALE LA PENA | Error de borrado de foto; MEDIO/BAJO/BAJO, seleccionado. |
| Rendimiento | VALE LA PENA | Respuesta A obsoleta sobrescribe fechas/cifras B y loading del dashboard; MEDIO/BAJO/BAJO, pendiente por cupo. No hay medición de latencia. |
| Responsividad | VALE LA PENA | Inputs auth de 14 px y objetivos táctiles pequeños: evidencia estática, MEDIO/BAJO/BAJO; pendiente por cupo y contraste en navegador. |
| QA | VALE LA PENA | Validación obligatoria de seleccionados. Deuda discrecional: tres E2E de categorías terminan al observar solicitudes, MEDIO/BAJO/BAJO; pendiente por cupo. |

El límite de tres no convierte los restantes en bajo retorno. Categorías
conserva evidencia en
`frontend/e2e/backoffice/backoffice-category-crud.spec.ts:88,135,177`;
la página inserta/reemplaza/retira filas después de completar esas solicitudes.
No hay autoría de categorías en esta ronda.

Descartes de bajo retorno: diferencia marginal de redondeo de 100 COP sin
cobro incorrecto demostrado; centralización/refactors cosméticos; optimizar
el detalle de catálogo sin nueva medida comparativa; más logs/APM sin una
decisión operativa; bump de Next por ImageResponse sin superficie aplicable.

Riesgos abiertos fuera de selección: política vigente de destacados POST/PATCH;
contrato/evidencia de PSE/Bancolombia sin URL y timeouts; descarte de borrador,
retirada del color completo y retries de POST upload. No se dispone de un
scanner completo de dependencias: no se certifica limpieza global.

## Baseline del puente y aceptación de la corrección

El baseline debe reproducir con navegador y API/BD scratch reales la cadena:
A cliente atacante verificado, B comprador con sesión propia, query JWT de A
instalada por el puente, checkout sintético de B asociado a A y lectura de
su dirección por A. El artefacto de prueba excluye JWT; fixtures privadas
no son evidencia para compartir. Baseline **confirmado** sobre la aplicación de `7bd32780`: B (`user_id=2`)
pasa a A (`user_id=1`); checkout real 201 crea `MMT-20261010-1801`; el ORM
confirma `customer_id=1` y email sintético de B. A obtiene 200 y lee
`Calle SINTETICA R3 123`; B obtiene 403. Proof saneado en
`test-results/improvement-20261010-r3/baseline/proof.json` del worktree QA;
log de ejecución `browser-proof-retry.log`. Runtime propio: Next PID 314945,
puerto 3311; Django PID 304316, puerto 8311. No había diffs de aplicación.
El primer intento agotó 30 segundos durante compilación inicial; el retry
del harness ignorado con 120 segundos completó la cadena. No hubo trace
ni captura de JWT. Seguridad recibió esta evidencia antes de editar app.

La corrección debe probar la cadena inversa: enlace antiguo rechazado,
identidad/cookies de B conservadas, checkout de B persistido para B y lectura
por A denegada con 403. Además, superuser autorizado emite el handoff de un
target cliente y éste se restaura mediante el canje real. Una simulación HTTP
no acredita la cadena de propiedad. El rechazo de canje muestra:
«El enlace de acceso no es válido o ha expirado.»

## Matriz de aceptación dirigida

| Capa | Entrada/interacción | Observable concreto |
|---|---|---|
| Backend puente | Emisión por superuser autorizado y canje firmado; inválido, expirado o target inelegible. | Tokens del target cliente sólo para canje válido; 400/403 genéricos según contrato. |
| Unit puente | Sesión B previa y rechazo del canje; canje válido. | B y sus cookies permanecen al rechazar; aceptación restaura target. |
| E2E puente real | Admin emite enlace desde UI; navegación al puente y canje real. Enlace JWT antiguo sobre sesión B seguido de checkout. | Target correcto en aceptación; en rechazo, pedido/dirección de B accesibles a B y 403 para A. |
| Backend correo | Órdenes persistidas full/partial y transición PENDING/DECLINED/APPROVED. | Texto/HTML muestran importe pagado y saldo exactos; cero confirmaciones antes de aprobación; persistencia y repetición conservadas. |
| Unit fotos | DELETE 404, 500 o red; 204 vacío; foto local sin ID. | Fallo conserva imagen/URL; 204 sólo elimina elegida; local no requiere DELETE. |
| E2E fotos | Widget real, retirar foto con respuesta 404/500/red y con 204 sin cuerpo. | Miniatura conservada y «No pudimos confirmar la eliminación de la imagen. Intenta de nuevo.» ante fallo; eliminación exclusiva ante éxito. |
| Gate y mapa | Archivos tocados y flujos de puente/fotos. | Gate estricto con severidad CI y lint externo; auditoría dirigida `e2e-user-flows-check`, sin rellenar clases por cuota. |

## Aislamiento y evidencia

Runtime baseline de QA: worktree `improvement-r3/qa` fijado al SHA diagnóstico,
Django 6.0.9 del venv temporal compartido; settings scratch con
`RepositoryEmpty`, SQLite disk explícita en `/tmp`, correo locmem, Huey en
memoria y MEDIA temporal. Esquema mediante `setup_databases`, nunca
`manage.py migrate`; sin acceso al .env o DB productivos.

Next debe servir el SHA probado en puerto aislado. Cookies usan hostname
localhost coherente con el navegador. Ningún servidor ajeno ni artefacto de
R2 sustituye esta procedencia. Autoría y baseline no equivalen a aceptación
combinada: el conductor fija SHA40 final limpio y el Verifier independiente
repite las capas requeridas antes de registrar el manifest.

Las ejecuciones usan archivos/nodos explícitos: máximo veinte casos por lote,
tres comandos por ciclo y dos specs Playwright por llamada. Artefactos
nativos por ejecución y SHA quedan en carpeta gitignored del worktree;
no se reetiquetan resultados de otra ronda.

## Solicitudes al orquestador

1. Integrar aplicación y pruebas de los tres autores; fijar SHA40 limpio y
   asignar runtime scratch de esa combinación al Verifier.
2. Verificar las capas requeridas y el gate con artefactos nativos; registrar
   manifest para los tres IDs exactos. Un fix posterior requiere repetir las
   comprobaciones afectadas en el nuevo SHA.
3. Integrar la configuración global aprobada y commiteada por el conductor
   en `957f692`: `FRONTEND_URL=http://localhost:3001` en Playwright CI.
   Resuelve el desacuerdo entre el navegador en 3001 y el default 3000
   del emisor; no se reescribe el enlace real para esconderlo.
4. Completar publicación y cierre remoto por el conductor. Este snapshot no
   presume un CI futuro, merge o despliegue.

Preparación E2E: el spec del puente aprovisiona usuarios/catálogo sintéticos
mediante Python inline únicamente sobre BD scratch verificada; local exige
variables explícitas y procedencia del mismo SHA, y CI sólo admite el
checkout GitHub y SQLite descartable existentes. Obtiene JWT de la API
real, nunca los firma con una clave inferida ni los publica.

Incidencia de runtime: Next dev añadió automáticamente su bloque de reglas
a `frontend/CLAUDE.md`, fuera del ownership QA. Tras detener el servidor,
el conductor autorizó retirar exclusivamente ese bloque; quedó restaurado
y el worktree QA limpio. No se incluyó el bloque en autoría.

## Autoría QA y auditoría de flujos

Specs escritos: tres casos del puente con API/BD real; cuatro casos del
borrado de foto con frontera HTTP controlada. El Analyst canónico revisó
las dos interfaces implementadas y devolvió los IDs `admin-login-handoff`
y `backoffice-peluch-color-photo-delete`. El mapa 1.5.9 registra sólo sus
clases reales (success/error y success/failure), sin pruebas para correos
ni categorías. El Architect acotó aceptación a propiedad persistida y
miniaturas visibles, sin assertions limitadas a llamadas.

Gate de autoría focal: exit 0, dos archivos, quince declaraciones estáticas,
cero errores, un warning, score 98; reglas strict, junk severity error,
Ruff y ESLint externos verdes. Artefacto:
`test-results/improvement-20261010-r3/qa-author-gate-final.json`.
Este resultado no acredita runtime corregido; la aceptación integrada y
la revisión independiente siguen pendientes. No hay solicitudes de
cambios en dependencias, lockfiles o migraciones. La única configuración
global solicitada fue `FRONTEND_URL` para CI, ya aprobada y commiteada
por el conductor; queda pendiente su aceptación en el tren combinado.

Freshness del mapa actualizado: exit 0, artefacto
`test-results/improvement-20261010-r3/qa-author-freshness-final.json`.
El audit global estático sigue señalando 32 flujos parciales históricos;
no se corrigen ni se certifica cobertura global en esta selección. Sus
créditos estáticos no demuestran ejecución de los siete casos nuevos.

Los dos servidores baseline propios se detuvieron tras guardar el proof;
los PID anteriores sólo identifican aquella ejecución, no servicios actuales.

Auditor canónico: los siete casos nuevos no son junk, duplicados ni pruebas
en capa equivocada. Puente verifica identidad/cookies y propiedad real del
pedido; fotos verifica efecto visible y hermana, con HTTP como frontera.
El único warning del gate es un falso positivo de selector: `.first()`
pertenece a Django ORM dentro del Arrange Python inline, no a Playwright.
Se conserva el warning sin rebajar reglas ni añadir una excepción global.
