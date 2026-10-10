import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../test-with-coverage';

const PASSWORD = 'R3SyntheticFixture123!';
const BRIDGE_ERROR = 'El enlace de acceso no es válido o ha expirado.';
const TAGS = ['@flow:admin-login-handoff', '@module:auth', '@priority:P1'];

type Account = { id: number; email: string };
type Fixture = { attacker: Account; buyer: Account; admin: Account; product: number; size: number; color: number };
type Tokens = { access: string; refresh: string };
let fixture: Fixture;
let apiOrigin: string;

function scratchRuntime(baseURL: string) {
  const repo = realpathSync(path.resolve(__dirname, '../../..'));
  const backend = path.join(repo, 'backend');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const isCI = process.env.GITHUB_ACTIONS === 'true';
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
    throw new Error('Handoff integration requires a loopback scratch runtime.');
  }
  const database = process.env.E2E_SCRATCH_DATABASE || (isCI ? path.join(backend, 'db.sqlite3') : '');
  const python = process.env.E2E_SCRATCH_PYTHON || (isCI ? path.join(backend, 'venv/bin/python') : '');
  const origin = process.env.E2E_SCRATCH_API_ORIGIN || (isCI ? 'http://127.0.0.1:8000' : '');
  if (!database || !python || !origin || !existsSync(database) || lstatSync(database).isSymbolicLink()) {
    throw new Error('Supply an existing scratch SQLite database, isolated Python and API origin.');
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
    throw new Error('The scratch API must be loopback.');
  }
  const resolvedDB = realpathSync(database);
  if (isCI) {
    const workspace = process.env.GITHUB_WORKSPACE;
    const runnerTemp = process.env.RUNNER_TEMP;
    if (!workspace || !runnerTemp || !existsSync(runnerTemp) || realpathSync(workspace) !== repo
      || resolvedDB !== path.join(backend, 'db.sqlite3') || commit !== process.env.GITHUB_SHA) {
      throw new Error('CI scratch provisioning requires the verified GitHub checkout and disposable database.');
    }
  } else {
    const provenancePath = process.env.E2E_RUNTIME_PROVENANCE;
    if (!resolvedDB.startsWith('/tmp/') || !resolvedDB.endsWith('.sqlite3') || !provenancePath) {
      throw new Error('Local handoff integration requires explicit /tmp SQLite and runtime provenance.');
    }
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    if (provenance.commit !== commit || realpathSync(provenance.backend_cwd) !== backend
      || realpathSync(provenance.frontend_cwd) !== path.join(repo, 'frontend')
      || provenance.database !== resolvedDB || provenance.frontend !== baseURL || provenance.backend !== origin) {
      throw new Error('The browser, API, database and tested commit must match runtime provenance.');
    }
  }
  return { backend, database: resolvedDB, python, origin, isCI };
}

// Arrange uses real Django rows only in the reviewed scratch database; it never migrates or loads .env.
const PREPARE_FIXTURE = `
import json, os, sys
import decouple
decouple.config = decouple.Config(decouple.RepositoryEmpty())
os.environ['DJANGO_DB_ENGINE'] = 'django.db.backends.sqlite3'
os.environ['DB_NAME'] = sys.argv[1]
os.environ['DJANGO_ENV'] = 'development'
os.environ['ENABLE_SILK'] = 'False'
os.environ['DJANGO_SETTINGS_MODULE'] = 'base_feature_project.settings'
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': sys.argv[1]}}
settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher', 'django.contrib.auth.hashers.PBKDF2PasswordHasher'] if sys.argv[2] == 'local' else ['django.contrib.auth.hashers.PBKDF2PasswordHasher']
import django
django.setup()
from django.contrib.auth import get_user_model
from base_feature_app.models import Category, GlobalColor, GlobalSize, Peluch, PeluchSizePrice
from django_attachments.models import Library
User = get_user_model()
users = {}
for name in ['attacker', 'buyer', 'admin']:
    user, _ = User.objects.get_or_create(email=f'handoff-r3-{name}@example.test')
    user.first_name = 'Compradora R3' if name == 'buyer' else name
    user.email_verified = True
    user.is_active = True
    user.is_staff = name == 'admin'
    user.is_superuser = name == 'admin'
    user.role = 'admin' if name == 'admin' else 'customer'
    user.set_password('R3SyntheticFixture123!')
    user.save()
    users[name] = {'id': user.pk, 'email': user.email}
category, _ = Category.objects.get_or_create(slug='handoff-r3', defaults={'name': 'Handoff R3'})
color, _ = GlobalColor.objects.get_or_create(slug='handoff-r3-coral', defaults={'name':'Coral R3','hex_code':'#d4848a'})
size, _ = GlobalSize.objects.get_or_create(slug='handoff-r3-mediano', defaults={'label':'Mediano R3','cm':'30 cm'})
product = Peluch.objects.filter(slug='handoff-r3-product').first()
if product is None:
    product = Peluch.objects.create(title='Oso handoff R3', slug='handoff-r3-product', category=category, lead_description='Fixture aislada', gallery=Library.objects.create(title='Handoff R3'))
product.available_colors.add(color)
PeluchSizePrice.objects.get_or_create(peluch=product, size=size, defaults={'price':80000,'free_shipping':True})
print(json.dumps({**users,'product':product.pk,'size':size.pk,'color':color.pk}))
`;

async function realTokens(request: APIRequestContext, account: Account): Promise<Tokens> {
  const response = await request.post(`${apiOrigin}/api/token/`, { data: { email: account.email, password: PASSWORD } });
  expect(response.status()).toBe(200);
  return response.json();
}

async function installBuyer(context: BrowserContext, request: APIRequestContext, baseURL: string) {
  const tokens = await realTokens(request, fixture.buyer);
  await context.addCookies([
    { name: 'access_token', value: tokens.access, url: baseURL, sameSite: 'Lax' },
    { name: 'refresh_token', value: tokens.refresh, url: baseURL, sameSite: 'Lax' },
  ]);
  return tokens;
}

async function expectBuyerCookies(context: BrowserContext, baseURL: string, expected: Tokens) {
  const cookies = await context.cookies(baseURL);
  // Compare booleans so a failed assertion cannot print signed JWT values in the report.
  expect(cookies.find(cookie => cookie.name === 'access_token')?.value === expected.access).toBe(true);
  expect(cookies.find(cookie => cookie.name === 'refresh_token')?.value === expected.refresh).toBe(true);
}

async function submitBuyerCheckout(page: Page) {
  // Persisted cart is Arrange; submission, ownership and detail authorization use the real UI/API/DB.
  await page.evaluate(ids => localStorage.setItem('cart', JSON.stringify({ state: { items: [{
    peluch_id: ids.product, peluch_slug: 'handoff-r3-product', title: 'Oso handoff R3',
    size_id: ids.size, size_label: 'Mediano R3', color_id: ids.color, color_name: 'Coral R3', color_hex: '#d4848a',
    unit_price: 80000, personalization_cost: 0, quantity: 1, gallery_urls: [],
    has_huella: false, huella_type: '', huella_text: '', huella_media_id: null,
    has_corazon: false, corazon_phrase: '', has_audio: false, audio_media_id: null,
    deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: true, shipping_cost: 0,
  }] }, version: 0 })), fixture);
  await page.goto('/checkout');
  await page.getByLabel('Nombre completo', { exact: true }).fill('Compradora R3');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(fixture.buyer.email);
  await page.getByLabel('Celular', { exact: true }).fill('3001234567');
  await page.getByLabel('Dirección completa', { exact: true }).fill('Calle SINTETICA handoff R3 123');
  await page.getByRole('checkbox').check();
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/orders/' && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Ir a pagar/ }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  return (await response.json()).order_number as string;
}

async function expectPrivateBuyerOrder(request: APIRequestContext, order: string, buyer: Tokens) {
  const attacker = await realTokens(request, fixture.attacker);
  const permitted = await request.get(`${apiOrigin}/api/orders/${order}/`, { headers: { Authorization: `Bearer ${buyer.access}` } });
  expect(permitted.status()).toBe(200);
  expect((await permitted.json()).address).toBe('Calle SINTETICA handoff R3 123');
  const forbidden = await request.get(`${apiOrigin}/api/orders/${order}/`, { headers: { Authorization: `Bearer ${attacker.access}` } });
  expect(forbidden.status()).toBe(403);
}

test.describe('Admin signed handoff — real ownership chain', () => {
  // Query/fragment credentials are never captured in traces, screenshots or videos.
  test.use({ trace: 'off', screenshot: 'off', video: 'off' });

  test.beforeAll(async ({ baseURL, request }) => {
    if (!baseURL) throw new Error('A scratch browser baseURL is required.');
    const runtime = scratchRuntime(baseURL);
    apiOrigin = runtime.origin;
    const health = await request.get(`${apiOrigin}/api/health/`);
    expect(health.status()).toBe(200);
    try {
      fixture = JSON.parse(execFileSync(runtime.python, ['-c', PREPARE_FIXTURE, runtime.database, runtime.isCI ? 'ci' : 'local'], {
      cwd: runtime.backend, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DJANGO_SETTINGS_MODULE: 'base_feature_project.settings' },
      }));
    } catch {
      throw new Error('Scratch fixture setup failed; credential-bearing subprocess output is suppressed.');
    }
  });

  // Bug caught: an attacker JWT link replaces the buyer who owns the subsequent checkout.
  test('rejects legacy attacker tokens without changing the buyer checkout owner',
    { tag: [...TAGS, '@outcome:error'] }, async ({ page, request, baseURL }) => {
      const buyer = await installBuyer(page.context(), request, baseURL!);
      const attacker = await realTokens(request, fixture.attacker);
      await page.goto('/orders');
      await expect(page.getByRole('heading', { name: 'Hola, Compradora R3 ♡' })).toHaveText('Hola, Compradora R3 ♡');
      await page.evaluate(tokens => {
        const target = new URL('/admin-login', location.origin);
        target.search = new URLSearchParams({ ...tokens, redirect: '/checkout' }).toString();
        location.assign(target.toString());
      }, attacker);
      await expect(page.getByRole('alert')).toHaveText(BRIDGE_ERROR);
      await expectBuyerCookies(page.context(), baseURL!, buyer);
      const order = await submitBuyerCheckout(page);
      await expectPrivateBuyerOrder(request, order, buyer);
    },
  );

  // Bug caught: a rejected signed assertion clears or replaces a previously valid buyer session.
  test('preserves the existing buyer after the real API rejects an invalid handoff',
    { tag: [...TAGS, '@outcome:error'] }, async ({ page, request, baseURL }) => {
      // quality: allow-flow-tag-mismatch (a signed handoff is consumed by navigation, without a credential form; real API rejection and buyer identity are asserted)
      const buyer = await installBuyer(page.context(), request, baseURL!);
      const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin-login/handoff/' && response.request().method() === 'POST');
      await page.goto('/admin-login#handoff=not-a-signed-assertion');
      expect((await rejected).status()).toBe(403);
      await expect(page.getByRole('alert')).toHaveText(BRIDGE_ERROR);
      await expectBuyerCookies(page.context(), baseURL!, buyer);
      await page.getByRole('banner').getByRole('link', { name: 'Mis pedidos', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Hola, Compradora R3 ♡' })).toHaveText('Hola, Compradora R3 ♡');
    },
  );

  // Bug caught: legitimate superuser login-as is lost, targets staff instead of the client, or leaks checkout ownership.
  test('accepts a superuser-issued client handoff through the real admin and checkout',
    { tag: [...TAGS, '@outcome:success'] }, async ({ page, request, baseURL }) => {
      await page.goto(`${apiOrigin}/admin/base_feature_app/user/${fixture.buyer.id}/change/`);
      await page.getByLabel('Email:', { exact: true }).fill(fixture.admin.email);
      await page.getByLabel('Password:', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: /Log in|Iniciar sesión/i }).click();
      const popupPromise = page.context().waitForEvent('page');
      await page.getByRole('link', { name: 'Login as this user', exact: true }).click();
      const client = await popupPromise;
      await expect.poll(() => client.url() === `${baseURL}/`).toBe(true);
      await client.getByRole('banner').getByRole('link', { name: 'Mis pedidos', exact: true }).click();
      await expect(client.getByRole('heading', { name: 'Hola, Compradora R3 ♡' })).toHaveText('Hola, Compradora R3 ♡');
      const cookies = await client.context().cookies(client.url());
      const buyer = { access: cookies.find(cookie => cookie.name === 'access_token')!.value, refresh: cookies.find(cookie => cookie.name === 'refresh_token')!.value };
      const order = await submitBuyerCheckout(client);
      await expectPrivateBuyerOrder(request, order, buyer);
    },
  );
});
