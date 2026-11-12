/** Verify actual App Router registration; no backend or production is contacted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

test('the public hosting state route is reachable with integration disabled', { timeout: 60000 }, async t => {
  const server = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '4395'], {
    env: { ...process.env, NODE_ENV: 'development', HOSTING_CONTROL_ENABLED: 'false' },
    stdio: 'ignore',
  });
  t.after(() => server.kill('SIGTERM'));
  let response;
  const deadline = Date.now() + 50000;
  while (Date.now() < deadline) {
    try {
      response = await fetch('http://127.0.0.1:4395/__hosting/state', { signal: AbortSignal.timeout(5000) });
      break;
    } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.equal(response?.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const state = await response.json();
  assert.equal(state.ready, false);
  assert.equal(state.mode, 'normal');
});
