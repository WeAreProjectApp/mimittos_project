---
trigger: manual
description: Stack, configuración, patrones y validación de Mimittos, verificados contra el código.
---

# Referencia técnica — Mimittos

Revisión: 2026-09-25. Las fuentes de versiones son
`backend/requirements.txt` y `frontend/package.json`; el lockfile fija la
resolución reproducible del frontend.

## Stack

| Backend | Versión declarada |
|---|---|
| Python | 3.12 en CI |
| Django | 6.0.8 |
| djangorestframework | 3.18.0 |
| djangorestframework-simplejwt | 5.5.1 |
| PyJWT | 2.13.0 |
| django-cors-headers | 4.9.0 |
| mysqlclient | >=2.2,<3.0 |
| Pillow | 12.3.0 |
| easy-thumbnails | 2.10.1 |
| Huey | >=3.3.4,<4.0 |
| Redis (cliente Python) | >=8.1.0,<9.0 |
| pytest / pytest-cov | 9.1.1 / 7.1.0 |
| factory-boy / freezegun | 3.3.3 / 1.5.5 |
| gunicorn | >=26.2,<27.0 |
| ruff | 0.16.5 |

| Frontend | Versión declarada |
|---|---|
| Next.js | 16.3.3 |
| React | 19.2.8 |
| TypeScript | ^6.0.3 |
| Zustand | ^5.0.15 |
| Axios | ^1.20.0 |
| Tailwind CSS | ^4.3.3 |
| Playwright | ^1.62.1 |
| Jest | ^30.4.2 |
| React Testing Library | ^16.3.2 |
| js-cookie | ^3.0.8 |
| recharts | ^3.10.1 |
| Swiper | ^14.2.0 |

## Configuración local

Trabajar en un worktree de sesión. Instalar frontend con `npm ci` dentro de su
`frontend/`; no reutilizar ni modificar `node_modules` de otro checkout.

`manage.py` carga `settings_dev`, que hereda la base configurada por variables.
El `.env` del entorno puede apuntar a MySQL productivo; un worktree que lo enlaza
no debe ejecutar migraciones, seeds ni escrituras contra esa base. Para pruebas
backend seleccionar explícitamente SQLite aislada y archivos concretos.

Ejemplo de configuración de desarrollo independiente:

```env
DJANGO_ENV=development
DJANGO_SECRET_KEY=replace-with-local-secret
DJANGO_DB_ENGINE=django.db.backends.sqlite3
DB_NAME=/tmp/mimittos-local.sqlite3
DJANGO_EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

MySQL usa `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` y `DB_PORT` junto con
`DJANGO_DB_ENGINE=django.db.backends.mysql`. Django no lee `DATABASE_URL`.
SMTP usa `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_HOST_USER` y
`DJANGO_EMAIL_HOST_PASSWORD`; los secretos Wompi permanecen en el backend.

Configuración pública del frontend:

```env
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_BACKEND_ORIGIN=http://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

El servidor manual Next.js usa el puerto 3000. Sus rewrites reenvían `/api` y
`/media` al origen Django; no incluyen `/admin` ni `/static`.

## Patrones de código

Acceso a pedidos: firmas con salt dedicado y vigencia de treinta días, separado
de la firma reusable por archivo de personalización. El código de pedido tiene
seis dígitos criptográficos, hash, vigencia de diez minutos y consumo único.
Se permiten hasta cinco envíos y cinco fallos por pedido/hora; reenvío espera
sesenta segundos y no reinicia fallos. Código nuevo invalida el anterior.
Los límites y consumo están dentro de transacciones con `select_for_update`.

El cliente guarda las capacidades por pedido y adjunta `X-Order-Access` sólo
a sus servicios privados. CORS permite explícitamente esa cabecera. Un enlace
de correo transmite la capacidad en fragmento, retirado antes de analytics.
Storage restringido conserva acceso en memoria durante la sesión actual;
un rechazo del servidor descarta la capacidad y muestra recuperación por correo.

Para comprobar locking, usar MySQL scratch con cuenta/grants exclusivos y
conexiones separadas. La ronda de privacidad utiliza settings ignorados que
fuerzan esa base, storage aislado, correo locmem y Huey en memoria. SQLite no
acredita carreras. No ejecutar migraciones sobre el `.env` enlazado del worktree.

- Una app de dominio: `base_feature_app`, con modelos separados y reexportados
  desde `models/__init__.py`.
- Vistas DRF funcionales y lógica de negocio en `services/`: analytics, email,
  media, notification, order, review y Wompi.
- Rutas agrupadas por dominio en `base_feature_app/urls/` y montadas bajo `/api/`.
- Stores frontend: `authStore`, `cartStore` y `blogStore`. El catálogo consume
  `peluchService`; `providers.tsx` restaura la sesión.
- `http.ts` concentra Axios y refresco JWT; tokens en cookies mediante js-cookie.
- La interfaz actual está en español. No hay selector de locale, provider de
  traducciones ni variantes `_es`/`_en` en el modelo Blog.
- Contenido configurable en `SiteContent.content_json`; emails con la plantilla
  `base_feature_app/templates/emails/base.html` mediante `utils/email_renderer.py`.

## Pruebas

Hasta 20 tests por ejecución, tres comandos por ciclo y dos specs E2E por llamada.
Seleccionar archivos y activar el venv al ejecutar pytest. No ejecutar la suite
completa para verificar un cambio puntual.

Desde `frontend/`:

```bash
npm test -- app/__tests__/page.test.tsx --runInBand
npx playwright test e2e/public/navigation.spec.ts --project="Desktop Chrome"
```

Jest: umbrales globales 65 % branches/lines/statements y 45 % functions;
stores 75 % y utils 90 % en las cuatro métricas. Playwright habilita sólo
Desktop Chrome, usa frontend en 3001 y backend en 8000, y reutiliza servidores
fuera de CI. Detalles en `frontend/TESTING.md` y `frontend/e2e/README.md`.

CI produce `backend/coverage-backend.json`, `backend/coverage-backend.xml`,
`backend/pytest-results.xml`, `frontend/jest-results.json`, `frontend/coverage/`
y `frontend/e2e-results/`. Son artefactos ignorados, no documentación versionada.

## Runtime y despliegue

Huey se ejecuta inmediatamente fuera de producción y utiliza Redis en producción.
La coordenada del fleet y los nombres de servicios proceden de `projects.yml`:

| Componente | Configuración de producción |
|---|---|
| Host | vps-projectapp-prod |
| Dominio / rama | mimittos.com / main |
| Django | mimittos_project, settings_prod |
| Next.js | mimittos-frontend, puerto 3002 |
| Worker | mimittos-huey |
| Base / Redis lógico | MySQL 8 / DB 10 |

El despliegue autorizado genera `.next/` y `staticfiles/` y administra ambos
procesos web. El merge de un PR no despliega servicios. Django no sirve páginas
Next.js mediante un catch-all. Ver `architecture.md`.

Los uploads viven en `backend/media/`. La validación de tipo y tamaño está en
las vistas/utilidades de media y en `MAX_UPLOAD_IMAGE_MB` / `MAX_UPLOAD_AUDIO_MB`;
los worktrees no deben modificar archivos de usuarios del clon principal.
