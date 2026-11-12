'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'

import { useAuthStore } from '@/lib/stores/authStore'
import { useCartStore } from '@/lib/stores/cartStore'

const NAV_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/catalog', label: 'Catálogo' },
  { href: '/about', label: 'Historia' },
  { href: '/contact', label: 'Contacto' },
]

export default function Header({ bannerHeight = 0 }: { bannerHeight?: number }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const cartCount = useCartStore((s) => s.items.reduce((acc, item) => acc + item.quantity, 0))
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => setMounted(true), [])

  // Close menu on route change
  useEffect(() => setMenuOpen(false), [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // Subtle scroll effect: shadow + stronger background
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const onScroll = () => {
      const scrolled = window.scrollY > 30
      gsap.to(header, {
        boxShadow: scrolled ? '0 4px 32px rgba(27,42,74,.10)' : '0 0 0 rgba(0,0,0,0)',
        background: scrolled ? 'rgba(255,249,246,.97)' : 'rgba(255,249,246,.9)',
        duration: 0.35,
        ease: 'power2.out',
        overwrite: 'auto',
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        ref={headerRef}
        style={{
          position: 'fixed', top: `calc(var(--hosting-banner-height, 0px) + ${bannerHeight}px)`, left: 0, right: 0, zIndex: 50,
          background: 'rgba(255,249,246,.9)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(212,132,138,.12)',
        }}
      >
        <div className="mx-auto flex items-center justify-between px-4 sm:px-8 lg:px-10 py-3" style={{ maxWidth: 1360 }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, zIndex: 60, position: 'relative' }}>
            <Image src="/mimittos/logo-dark-small.png" alt="MIMITTOS" width={48} height={48}
              style={{ borderRadius: '50%', boxShadow: 'var(--shadow-sm)' }} />
            <span style={{
              fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
              fontSize: 22, letterSpacing: '.24em', color: 'var(--coral)',
            }}>MIMITTOS</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex" style={{ gap: 36, alignItems: 'center' }}>
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} style={{
                fontWeight: 600, fontSize: 15,
                color: pathname === href ? 'var(--coral)' : 'var(--navy)',
                transition: 'color .2s',
              }}>
                {label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/cart" style={{ ...iconBtnStyle, position: 'relative' } as React.CSSProperties} aria-label="Carrito">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {cartCount > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  minWidth: 18, height: 18, borderRadius: '50%',
                  background: 'var(--coral)', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'grid', placeItems: 'center', padding: '0 5px',
                }}>{cartCount}</span>
              )}
            </Link>

            {mounted && (isAuthenticated ? (
              <Link href="/orders" className="hidden sm:inline-flex" style={loginBtnStyle}>Mis pedidos</Link>
            ) : (
              <Link href="/sign-in" className="hidden sm:inline-flex" style={loginBtnStyle}>Ingresar</Link>
            ))}

            {/* Hamburger / Close — mobile only */}
            <button
              className="flex md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              style={{ ...iconBtnStyle, display: undefined, flexDirection: 'column', gap: 5, padding: 10, position: 'relative', zIndex: 60 }}
            >
              <span style={{
                display: 'block', width: 20, height: 2,
                background: 'var(--navy)', borderRadius: 2,
                transition: 'transform .3s, opacity .3s',
                transform: menuOpen ? 'translateY(7px) rotate(45deg)' : 'none',
              }} />
              <span style={{
                display: 'block', width: 20, height: 2,
                background: 'var(--navy)', borderRadius: 2,
                opacity: menuOpen ? 0 : 1, transition: 'opacity .3s',
              }} />
              <span style={{
                display: 'block', width: 20, height: 2,
                background: 'var(--navy)', borderRadius: 2,
                transition: 'transform .3s, opacity .3s',
                transform: menuOpen ? 'translateY(-7px) rotate(-45deg)' : 'none',
              }} />
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen mobile menu */}
      <MobileMenuOverlay
        open={menuOpen}
        pathname={pathname}
        mounted={mounted}
        isAuthenticated={isAuthenticated}
      />
    </>
  )
}

function MobileMenuOverlay({
  open,
  pathname,
  mounted,
  isAuthenticated,
}: {
  open: boolean
  pathname: string
  mounted: boolean
  isAuthenticated: boolean
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const linksRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const isAnimating = useRef(false)

  useEffect(() => {
    const overlay = overlayRef.current
    const linksContainer = linksRef.current
    const footer = footerRef.current
    if (!overlay || !linksContainer || !footer) return

    const links = linksContainer.querySelectorAll('a')

    if (open) {
      // Show overlay
      overlay.style.display = 'flex'
      isAnimating.current = true

      const tl = gsap.timeline({ onComplete: () => { isAnimating.current = false } })
      tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' })
        .fromTo(
          links,
          { opacity: 0, y: 36 },
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' },
          '-=0.15'
        )
        .fromTo(
          footer,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
          '-=0.3'
        )
    } else {
      if (overlay.style.display === 'none') return
      isAnimating.current = true

      const tl = gsap.timeline({
        onComplete: () => {
          overlay.style.display = 'none'
          isAnimating.current = false
        },
      })
      tl.to([...links, footer], { opacity: 0, y: 16, stagger: 0.04, duration: 0.2, ease: 'power2.in' })
        .to(overlay, { opacity: 0, duration: 0.25, ease: 'power2.in' }, '-=0.1')
    }
  }, [open])

  return (
    <div
      ref={overlayRef}
      className="md:hidden"
      role="dialog"
      aria-modal="true"
      style={{
        display: 'none',
        position: 'fixed',
        inset: 0,
        top: 'var(--hosting-banner-height, 0px)',
        zIndex: 49,
        flexDirection: 'column',
        background: 'rgba(255,249,246,.97)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflowY: 'auto',
      }}
    >
      {/* Nav links — centered vertically */}
      <div
        ref={linksRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 36,
          paddingRight: 36,
          paddingTop: 100,
          gap: 4,
        }}
      >
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              fontFamily: "'Quicksand', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(36px, 10vw, 56px)',
              letterSpacing: '-.02em',
              lineHeight: 1.15,
              color: pathname === href ? 'var(--coral)' : 'var(--navy)',
              paddingTop: 16,
              paddingBottom: 16,
              borderBottom: '1px solid rgba(212,132,138,.12)',
              display: 'block',
              opacity: 0,
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Footer actions */}
      <div
        ref={footerRef}
        style={{
          padding: '32px 36px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          opacity: 0,
        }}
      >
        {mounted && (isAuthenticated ? (
          <Link href="/orders" style={{ ...loginBtnStyle, display: 'inline-flex', justifyContent: 'center', fontSize: 16, padding: '14px 28px' }}>
            Mis pedidos
          </Link>
        ) : (
          <Link href="/sign-in" style={{ ...loginBtnStyle, display: 'inline-flex', justifyContent: 'center', fontSize: 16, padding: '14px 28px' }}>
            Ingresar
          </Link>
        ))}
        <span style={{ fontSize: 13, color: 'var(--gray-warm)', textAlign: 'center', opacity: 0.7 }}>
          Hecho con amor en Colombia 🐻
        </span>
      </div>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 42, height: 42, borderRadius: '50%',
  display: 'grid', placeItems: 'center',
  color: 'var(--navy)', background: 'transparent',
  transition: 'background .2s, color .2s',
}

const loginBtnStyle: React.CSSProperties = {
  background: 'var(--coral)', color: '#fff',
  padding: '10px 20px', borderRadius: 999,
  fontWeight: 600, fontSize: 14,
  boxShadow: '0 6px 16px rgba(212,132,138,.28)',
  transition: 'transform .2s, box-shadow .2s',
}
