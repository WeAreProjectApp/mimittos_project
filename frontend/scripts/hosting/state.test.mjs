import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stateFor } from '../../lib/hosting-control.ts';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'hosting-node-'));
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.HOSTING_CONTROL_ENABLED = 'true';
  process.env.HOSTING_CONTROL_TARGET = directory.split('/').pop();
  process.env.HOSTING_CONTROL_STATE_FILE = join(directory, 'state.json');
  t.after(() => { process.env = previous; rmSync(directory, { recursive: true, force: true }); });
  const raw = { environment: 'production', message: { text: 'Mensaje de prueba', title: 'Aviso de prueba' }, mode: 'banner', origins: ['https://fixture.example'], schema: 1, target_key: process.env.HOSTING_CONTROL_TARGET, version: 1 };
  const save = (changes = {}) => {
    const value = { ...raw, ...changes };
    const ordered = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    const digest = createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
    writeFileSync(process.env.HOSTING_CONTROL_STATE_FILE, JSON.stringify({ ...ordered, digest }));
    return { ...ordered, digest };
  };
  return { save, request: new Request('https://fixture.example/deep', { headers: { host: 'fixture.example' } }) };
}

test('loads the acknowledged production payload', t => {
  const { save, request } = fixture(t);
  const value = save();
  assert.deepEqual(stateFor(request), value);
});
test('does not load an enrolled file in development', t => {
  const { save, request } = fixture(t);
  save(); process.env.NODE_ENV = 'development';
  assert.equal(stateFor(request), null);
});
test('does not serve state to another host', t => {
  const { save } = fixture(t); save();
  assert.equal(stateFor(new Request('https://other.example', { headers: { host: 'other.example' } })), null);
});
test('rejects a foreign production identity', t => {
  const { save, request } = fixture(t); save({ target_key: 'other' });
  assert.equal(stateFor(request), null);
});
test('keeps the previous state after a broken file', t => {
  const { save, request } = fixture(t);
  const value = save(); stateFor(request);
  writeFileSync(process.env.HOSTING_CONTROL_STATE_FILE, '{');
  assert.deepEqual(stateFor(request), value);
});
test('reads a new message from the durable file', t => {
  const { save, request } = fixture(t);
  save(); stateFor(request);
  const next = save({ version: 2, message: { text: 'Texto nuevo', title: 'Título nuevo' } });
  assert.deepEqual(stateFor(request), next);
});
