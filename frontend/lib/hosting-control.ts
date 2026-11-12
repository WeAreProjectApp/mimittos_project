import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type State = {
  schema: number; target_key: string; environment: string; origins: string[];
  version: number; mode: 'normal' | 'banner' | 'suspended';
  message: { title: string; text: string }; digest: string;
};
let lastValid: State | null = null;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function stateFor(request: Request): State | null {
  if (process.env.NODE_ENV !== 'production' || process.env.HOSTING_CONTROL_ENABLED !== 'true' || !process.env.HOSTING_CONTROL_TARGET) return null;
  try {
    const raw = readFileSync(process.env.HOSTING_CONTROL_STATE_FILE || '', 'utf8');
    if (Buffer.byteLength(raw) > 32768) throw new Error('Invalid state size');
    const value = JSON.parse(raw) as State;
    const { digest, ...payload } = value;
    if (value.schema !== 1 || value.environment !== 'production' || value.target_key !== process.env.HOSTING_CONTROL_TARGET
      || !['normal', 'banner', 'suspended'].includes(value.mode) || !Number.isSafeInteger(value.version)
      || !Array.isArray(value.origins) || typeof value.message?.title !== 'string' || typeof value.message?.text !== 'string'
      || createHash('sha256').update(canonical(payload)).digest('hex') !== digest) throw new Error('Invalid state');
    lastValid = value;
  } catch { /* Preserve the previously validated presentation on transient file failure. */ }
  if (lastValid?.target_key !== process.env.HOSTING_CONTROL_TARGET || !lastValid.origins.some(origin => new URL(origin).host === request.headers.get('host'))) return null;
  return lastValid;
}

