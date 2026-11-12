import { NextResponse } from 'next/server';
import { stateFor } from '@/lib/hosting-control';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const state = stateFor(request);
  return NextResponse.json({ ...(state || { mode: 'normal' }), ready: state !== null, exempt_paths: ['/api/', '/admin/', '/admin-gallery/'], adapter_version: 1 }, { headers: { 'Cache-Control': 'no-store' } });
}
