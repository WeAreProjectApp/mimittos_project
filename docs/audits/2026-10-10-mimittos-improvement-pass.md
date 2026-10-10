# Ronda transversal dirigida de MIMITTOS — 2026-10-10

## Alcance y decisión

Base examinada: `49c94dc96bb9238fd5dfe2971bf23861e711dec7`. El clon principal
está atrasado y sirve la aplicación; se trabaja en los worktrees autorizados
de esta ronda, sin editar ese clon ni usar su BD. La revisión es dirigida,
no una certificación de madurez del proyecto completo.

El operador eligió tres causas: contraseña del pre-registro, presentación de
errores indexados de checkout y protección conductual de compra completa.
No se añaden dependencias, migraciones ni cambios de Wompi o responsive.

| Frente | Decisión | Evidencia y beneficio | Impacto / esfuerzo / riesgo |
|--------|----------|-----------------------|-----------------------------|
| Seguridad | VALE LA PENA; seleccionada | `backend/base_feature_app/views/auth.py:141-150` verifica el correo conservando la contraseña del pre-registro. Exigir contraseña nueva evita que quien registró un correo ajeno entre después de que su dueño lo verifique. | ALTO / MEDIO / MEDIO |
| Mantenibilidad | VALE LA PENA; seleccionada | `frontend/app/checkout/page.tsx:103-115` extrae sólo campos de medios y pierde quantity/disponibilidad. Mostrar el mensaje junto a la variante correcta permite corregir el carrito. | MEDIO / BAJO / BAJO |
| QA | VALE LA PENA; seleccionada | `frontend/e2e/app/complete-purchase.spec.ts:35-79` del SHA base puede terminar verde sin producto ni las acciones de compra. Se exige el recorrido completo y el botón habilitado. | ALTO / MEDIO / BAJO |
| Observabilidad | VALE LA PENA; aplazada por el operador | `backend/base_feature_app/services/wompi_service.py:273,278,318,341` hace hasta quince GET y sleeps, con timeout GET de diez segundos. `frontend/app/payment/page.tsx:236` trata ERROR como pago rechazado; `frontend/app/order-confirmed/page.tsx:115` y `backend/base_feature_project/tasks.py:359` consultan estados. Bancario PENDING sin URL bloquea una solución completa. | ALTO / MEDIO / MEDIO |
| Rendimiento | VALE LA PENA para la misma causa Wompi; sin cambio independiente | El request de polling puede superar gunicorn de treinta segundos. Catálogo (`views/catalog.py:319`, `serializers/catalog.py:224,228`) repite mínimos, pero falta medir consultas con dataset representativo. | Wompi ALTO / MEDIO / MEDIO; catálogo necesita evidencia |
| Responsividad | VALE LA PENA; pendiente por cupo y validación viva | Inputs de auth a 14 px (`sign-in:157`, `sign-up:353`, `forgot-password:289`) frente a FORM-3 mínimo 16; objetivos de términos/ojos/reenvío inferiores a FORM-2 de 44 px (`sign-up:301,278,188`, `sign-in:117`, `forgot-password:195,239`). | Ambos MEDIO / BAJO / BAJO |

Las referencias de los descartes describen el código base y pueden desplazarse
al integrar los cambios. El perfil informado para rendimiento es
`vps-projectapp-prod`: cuatro vCPU, 15 GB RAM, dos procesos con un worker,
timeout de treinta segundos, presupuesto CPU de 100 ms y 20 MB por request;
detalle de producto con hasta cuatro consultas. Esta ronda no mide producción.
Ventas y pedidos administrativos ya tienen paginación con máximo cien filas.

## Contratos y propiedad

- **Seguridad / `improve/seguridad`:** aplicación auth y sus pruebas de API,
  presupuesto de códigos, store, formulario y verificación E2E. La API exige
  `new_password` válida; omitirla o rechazarla no consume código ni cambia
  cuenta. Código válido reemplaza la contraseña anterior antes de emitir
  sesión, conserva el bloqueo administrativo y tiene consumo único.
- **Mantenibilidad / `improve/mantenibilidad`:** aplicación checkout y sus
  pruebas de presentación, envelope API y E2E. quantity, producto, talla y
  color se atribuyen a su línea; medios mantienen su recuperación existente.
- **QA / `improve/qa`:** sólo el caso principal de
  `frontend/e2e/app/complete-purchase.spec.ts`, registro de flujos, mapa, este
  reporte y nuevas secciones breves de memoria autorizadas. Fixture controlada;
  Inicio → Catálogo → detalle → agregar → carrito → checkout, formulario y
  términos; producto conservado y botón habilitado. No se ejecuta pago.
- **Orquestador:** integración, Git de entrega y evidencia final de la
  combinación. Ningún autor escribe pruebas ni aplicación de otro dueño.

IDs obtenidos del preview del motor, sin persistir el ledger del toolkit:
seguridad `I-S-57de005e24a0`, checkout `I-M-461b80d84a41`; el histórico Wompi
es `I-O-67da682e9ff0`. El preview no concede estado verificado.

## Verificación y límites

La QA final es única sobre la combinación limpia y su SHA exacto. Los comandos
usan archivos/nodos explícitos: máximo veinte casos por lote, tres comandos
por ciclo y dos specs por llamada Playwright. SQLite aislada valida API;
los locks requieren MySQL scratch y conexiones separadas. Email locmem,
medios temporales y Huey aislado impiden efectos sobre servicios.

El harness gitignored de `test-results/improvement-20261010/` omite los
webServer del config tracked: arranca Next desde el worktree indicado y una
API stub local. Registra cwd/SHA/PIDs y prepara las rutas en navegador antes
del presupuesto del caso. No enlaza `backend/venv` ni carga `.env` productivo.
La procedencia debe repetirse sobre el SHA combinado; la de un autor con
cambios pendientes no acredita esa combinación.

La autoría y los resultados finales se distinguen: la aceptación de la
combinación se consulta en
`test-results/improvement-20261010/final-qa-manifest.json` del worktree de
integración, ligado al SHA40 limpio. El orquestador conserva esos artefactos
fuera del worktree antes de retirarlo y comprueba el CI de los PR entregados.
Este informe no sustituye el manifiesto ni presume sus resultados.

Auditoría `e2e-user-flows-check` dirigida: el registro exige password nueva en
verificación, amplía checkout-form-validation con outcome error y conserva
purchase-complete-flow con outcome success. Freshness heurística aprobada;
audit estático de la rama autora: 38 specs, 147 tests, 104 flujos declarados,
67 cubiertos, 34 parciales, tres exentos, cero junk-only. Seis módulos siguen
sin clases negativas declaradas. Esos conteos no demuestran conducta ni
vigencia global: el scanner también concede crédito a casos antiguos
condicionales. Artefactos: `flow-audit-author.json` y `flow-freshness.json`.

El gate final conserva `.junk-baseline.json` y severidad de CI:
`--semantic-rules strict --junk-severity=error --external-lint run`, sobre
los archivos tocados. No ampliar baseline, aflojar assertions ni declarar
collection-only como ejecución. Conservar errores y resultados originales.

## Descartes, riesgos y solicitudes al orquestador

- Fórmulas equivalentes y JPEG sin divergencia: no justifican trabajo.
- Reintentos SMTP: MEDIO / MEDIO / MEDIO y riesgo de correos duplicados;
  aplazados. No prometer entrega durable.
- Otros E2E condicionales, campos obligatorios y varios productos:
  MEDIO / MEDIO / BAJO; fuera del lote. Carrito y rechazo pendiente ya
  reparados se conservan como regresión, sin reabrir su implementación.
- Polling/redirect bancario Wompi permanece pendiente; no se acredita una
  solución bancaria ni pago real por estos mocks.
- Catálogo necesita medición y responsive validación de anchos/controles;
  no inventar métricas o capturas para justificar cambios.
- Discrepancias de historias/ledger se informan sin modificar el toolkit.
- Solicitudes al orquestador: combinar las tres autorías, fijar SHA limpio,
  realizar QA final y comprobar CI/entrega; no merge ni deploy de los autores.

Este informe debe leerse junto a los artefactos reales de ejecución del
worktree de integración. No afirma CI verde ni despliegue.
