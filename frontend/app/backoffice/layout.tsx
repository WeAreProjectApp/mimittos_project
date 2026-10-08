'use client'

import { useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/useRequireAuth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useRequireAuth({ requireStaff: true })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!isAuthenticated || !isAdmin) return null

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--cream-warm)' }}>
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 lg:ml-[220px] min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 lg:hidden px-4 py-3 border-b" style={{
          background: 'var(--navy)',
          borderColor: 'rgba(255,255,255,.08)',
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '-.02em' }}>
            Peluchelandia
          </span>
        </div>

        <main className="overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
