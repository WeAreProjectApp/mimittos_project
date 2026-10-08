'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'

const NAV = [
  { href: '/backoffice', label: 'Dashboard', icon: '◈' },
  { href: '/backoffice/pedidos', label: 'Pedidos', icon: '📦' },
  { href: '/backoffice/peluches', label: 'Peluches', icon: '🧸' },
  { href: '/backoffice/categorias', label: 'Categorías', icon: '🏷️' },
  { href: '/backoffice/usuarios', label: 'Usuarios', icon: '👤' },
  { href: '/backoffice/configuracion', label: 'Configuración', icon: '⚙️' },
]

interface AdminSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname()
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          data-testid="backoffice-sidebar-overlay"
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside style={{
        position: 'fixed', top: 0, left: 0,
        width: 220, height: '100vh', background: 'var(--navy)',
        display: 'flex', flexDirection: 'column', padding: '28px 0',
        zIndex: 50,
        transition: 'transform .25s ease',
        transform: isOpen ? 'translateX(0)' : undefined,
      }} className={!isOpen ? '-translate-x-full lg:translate-x-0' : ''}>
        <div style={{ padding: '0 20px 28px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 800, fontSize: 18, color: '#fff', letterSpacing: '-.02em' }}>
            Peluchelandia
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.1em' }}>
            Panel Admin
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ href, label, icon }) => {
            const active = href === '/backoffice' ? pathname === href : pathname.startsWith(href)
            return (
              <Link key={href} href={href} onClick={onClose} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
                fontSize: 14, fontWeight: active ? 700 : 500,
                background: active ? 'rgba(255,255,255,.1)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,.55)',
                transition: 'all .15s',
              }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '16px 10px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link href="/" onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
            fontSize: 13, color: 'rgba(255,255,255,.45)',
          }}>
            <span style={{ fontSize: 15 }}>🏪</span>
            Ver tienda
          </Link>
          <button onClick={signOut} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit', textAlign: 'left',
            background: 'transparent', color: 'rgba(255,100,100,.75)',
            transition: 'all .15s',
          }}>
            <span style={{ fontSize: 15 }}>→</span>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  )
}
