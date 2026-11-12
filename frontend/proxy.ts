/** Production-only document adapter. Business APIs and data remain available. */
import { stateFor } from '@/lib/hosting-control';
import { NextRequest, NextResponse } from 'next/server';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function proxy(request: NextRequest) {
  const state = stateFor(request);
  const documentRequest = ['GET', 'HEAD'].includes(request.method) && (request.headers.get('accept') || '').includes('text/html');
  if (!state || !documentRequest) return NextResponse.next();
  const headers = { 'Cache-Control': 'no-store', 'X-Hosting-Version': String(state.version), 'X-Hosting-Digest': state.digest };
  if (state.mode !== 'suspended') return NextResponse.next({ headers });
  const initial = JSON.stringify({ ...state, exempt_paths: [], ready: true }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(state.message.title)}</title><link rel="stylesheet" href="/__hosting/notice.css"><script defer src="/__hosting/notice.js"></script></head><body data-hosting-standalone="true"><main id="hosting-notice" class="hosting-screen"><h1>${escape(state.message.title)}</h1><p>${escape(state.message.text)}</p></main><script type="application/json" id="hosting-initial">${initial}</script></body></html>`;
  return new NextResponse(html, { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30' } });
}

export const config = {
  matcher: ['/((?!api/|admin/|admin-gallery/|__hosting/|_next/|health/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$).*)'],
};
