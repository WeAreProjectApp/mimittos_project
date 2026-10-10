'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/lib/stores/authStore';

export default function AdminLoginPage() {
  const router = useRouter();
  const mounted = useRef(false);
  const operation = useRef<Promise<boolean> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (!operation.current) {
      const url = new URL(window.location.href);
      const handoff = new URLSearchParams(url.hash.slice(1)).get('handoff');
      // Remove both the assertion and obsolete bearer-token parameters immediately.
      url.hash = '';
      url.searchParams.delete('access');
      url.searchParams.delete('refresh');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
      operation.current = handoff
        ? useAuthStore.getState().exchangeAdminHandoff(handoff, () => mounted.current)
        : Promise.resolve(false);
    }
    // StrictMode's second setup observes the same operation without repeating POST.
    void operation.current.then((accepted) => {
      if (!active) return;
      if (accepted) router.replace('/');
      else setError(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; mounted.current = false; };
  }, [router]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--gray-warm)' }}>
      {error
        ? <p role="alert">El enlace de acceso no es válido o ha expirado.</p>
        : 'Iniciando sesión...'}
    </main>
  );
}
