'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'

import { api } from '@/lib/services/http'
import type { Category, Peluch, HomeReview } from '@/lib/types'
import { FadeUp, FadeIn, SlideIn, StaggerContainer, StaggerItem } from '@/components/ui/motion'

const FAQS = [
  {
    q: '📍 ¿Dónde están ubicados?',
    a: 'Estamos en Bogotá, Colombia 🇨🇴\nDesde aquí damos vida a cada peluche de forma artesanal, cuidando cada detalle para que llegue hasta ti lleno de amor y con esa magia especial que solo un gran abrazo puede transmitir.',
  },
  {
    q: '🚚 ¿Hacen envíos a todo Colombia?',
    a: 'Sí 🎉 Enviamos a toda Colombia para que tu peluche pueda llegar sin importar dónde estés. Trabajamos con transportadoras aliadas que nos ayudan a llevar cada pedido de forma segura y con mucho cuidado.',
  },
  {
    q: '💰 ¿Cuánto vale el envío?',
    a: 'El valor del envío depende del tamaño de tu peluche, el peso y la ciudad de destino. El pago se realiza al momento de recibir tu pedido, según el valor que indique la transportadora.\nAsí tu abrazo llega directo hasta tu puerta 🚪🧸',
  },
  {
    q: '✨ ¿Lo puedo personalizar?',
    a: '¡Por supuesto! 💛 Cada peluche puede llevar ese detalle único que lo hace aún más especial. Actualmente manejamos personalizaciones como:\n• 🐾 Huellita bordada\n• 💜 Corazón especial\n• 🎙️ Audio personalizado\nPorque cada historia merece un abrazo que la represente.',
  },
  {
    q: '📦 ¿Manejan precios por mayor?',
    a: 'Sí, claro 🤝 Trabajamos pedidos al por mayor para peluches pequeños, grandes y también proyectos especiales para empresas, eventos o regalos corporativos. Cuando la cantidad lo permite, manejamos precios preferenciales pensados especialmente para ti.',
  },
  {
    q: '🐻 ¿Manejan peluches más pequeños?',
    a: 'Nuestra especialidad son los peluches de gran formato, esos abrazos gigantes que se convierten en recuerdos inolvidables 🥰 Pero también manejamos algunas referencias más pequeñas, según el diseño y lo que estés buscando. ¡Siempre podemos ayudarte a encontrar el indicado para ti!',
  },
  {
    q: '🎁 ¿Manejan descuentos y promociones?',
    a: 'Sí 🎊 En fechas especiales, temporadas importantes y para nuestros clientes frecuentes, solemos tener promociones y beneficios especiales. También manejamos precios preferenciales para compras por cantidad. Porque consentir a quienes confían en nosotros también hace parte de nuestra historia 💕',
  },
]

const BADGE_BG: Record<string, string> = {
  bestseller: 'var(--coral)',
  new: 'var(--coral)',
  limited_edition: 'var(--navy)',
}
const BADGE_LABEL: Record<string, string> = {
  bestseller: 'Más vendido',
  new: 'Nuevo',
  limited_edition: 'Ed. limitada',
}

function fmt(n: number | null) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ color: 'var(--coral)', marginBottom: 14, fontSize: 16, letterSpacing: 2 }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </div>
  )
}

function PeluchCard({ p }: { p: Peluch }) {
  const img = p.available_colors[0]?.preview_url ?? p.gallery_urls[0] ?? null
  const badgeBg = BADGE_BG[p.badge] ?? ''
  return (
    <Link href={`/peluches/${p.slug}`} style={{ background: '#fff', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', textDecoration: 'none' }}>
      <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--pink-melo)', overflow: 'hidden' }}>
        {p.badge !== 'none' && badgeBg && (
          <span style={{ position: 'absolute', top: 14, left: 14, background: badgeBg, color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 999, boxShadow: 'var(--shadow-sm)', zIndex: 1 }}>
            {BADGE_LABEL[p.badge]}
          </span>
        )}
        {p.discount_pct > 0 && (
          <span style={{ position: 'absolute', top: 14, right: 14, background: 'var(--terracotta)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '6px 10px', borderRadius: 999, boxShadow: 'var(--shadow-sm)', zIndex: 1 }}>
            -{p.discount_pct}%
          </span>
        )}
        {img ? (
          <Image src={img} alt={p.title} fill className="object-cover" />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 48 }}>🧸</div>
        )}
      </div>
      <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h4 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>{p.title}</h4>
        <div style={{ fontSize: 13, color: 'var(--gray-warm)' }}>Personalizable · {p.available_colors.length > 0 ? `${p.available_colors.length} colores` : '3 tamaños'}</div>
        {p.available_colors.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {p.available_colors.slice(0, 5).map((c) => (
              <span key={c.id} style={{ width: 14, height: 14, borderRadius: '50%', background: c.hex_code, border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.08)', display: 'inline-block' }} />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed rgba(212,132,138,.2)' }}>
          <div>
            <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--terracotta)' }}>{fmt(p.discounted_min_price ?? p.min_price)}</div>
            <small style={{ fontWeight: 500, fontSize: 12, color: 'var(--gray-warm)' }}>desde</small>
          </div>
          <div style={{ background: 'var(--coral)', color: '#fff', width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

const STEPS = [
  { n: '01', title: 'Diseña', desc: 'Eliges modelo, tamaño y color en nuestro configurador visual. Sin escribir un solo mensaje.' },
  { n: '02', title: 'Abonas desde el 30%', desc: 'Pagas desde el 30% por PSE, tarjeta o Nequi para iniciar la producción de tu peluche.' },
  { n: '03', title: 'Creamos a mano', desc: 'En 4 a 6 días, cosemos tu peluche con los materiales más suaves. Te avisamos cada etapa.' },
  { n: '04', title: 'Lo recibes', desc: 'Llega a tu puerta, pagas el saldo contraentrega y le das el primer abrazo. Así de simple.' },
]

function ProcessStepCard({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      padding: 28,
      boxShadow: 'var(--shadow-sm)',
      borderTop: '3px solid var(--coral)',
      height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{
          fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 11,
          letterSpacing: '.18em', textTransform: 'uppercase',
          color: '#fff', background: 'var(--coral)',
          padding: '4px 10px', borderRadius: 999,
        }}>MIMITTOS</span>
        <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 300, fontSize: 32, color: 'var(--pink-pastel)', lineHeight: 1 }}>{n}</span>
      </div>
      <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--navy)', marginBottom: 10 }}>{title}</h3>
      <p style={{ color: 'var(--gray-warm)', fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
    </div>
  )
}

const HERO_FALLBACK = '/mimittos/team/costurera.webp'

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [featuredCategories, setFeaturedCategories] = useState<Category[]>([])
  const [featuredPeluches, setFeaturedPeluches] = useState<Peluch[]>([])
  const [homeReviews, setHomeReviews] = useState<HomeReview[]>([])
  const [heroImage, setHeroImage] = useState<string>(HERO_FALLBACK)

  useEffect(() => {
    api.get<Category[]>('/categories/featured/').then((r) => setFeaturedCategories(r.data)).catch(() => null)
    api.get<Peluch[]>('/peluches/featured/').then((r) => setFeaturedPeluches(r.data)).catch(() => null)
    api.get<HomeReview[]>('/reviews/home/').then((r) => setHomeReviews(r.data)).catch(() => null)
    api.get('/content/hero_image/').then((r) => {
      const url = r.data?.content_json?.image_url as string | undefined
      if (url) setHeroImage(url)
    }).catch(() => null)
  }, [])

  const designHref = featuredPeluches[0]?.slug
    ? `/peluches/${featuredPeluches[0].slug}`
    : '/catalog'

  return (
    <main>
      {/* HERO */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        background: 'radial-gradient(circle at 85% 15%, #FFE5E5 0%, transparent 45%), radial-gradient(circle at 10% 90%, #FFF0E8 0%, transparent 55%), var(--cream-warm)',
      }}>
        <div className="mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-[60px] items-center px-4 sm:px-8 lg:px-10 pt-12 pb-16 md:pt-[72px] md:pb-[100px]" style={{ maxWidth: 1360 }}>
          <div>
            <FadeUp delay={0.1}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(212,132,138,.2)', padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'var(--terracotta)', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral)', boxShadow: '0 0 0 4px rgba(212,132,138,.2)', display: 'inline-block' }} />
                Hecho con amor en Colombia
              </span>
            </FadeUp>
            <FadeUp delay={0.2}>
              <h1 data-testid="home-heading" className="text-[32px] md:text-[36px] lg:text-[68px]" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, lineHeight: 1.02, marginTop: 24, color: 'var(--navy)', letterSpacing: '-.02em' }}>
                Cada abrazo guarda un{' '}
                <em style={{ fontStyle: 'normal', color: 'var(--coral)', position: 'relative', display: 'inline-block' }}>recuerdo</em>{' '}
                único.
              </h1>
            </FadeUp>
            <FadeUp delay={0.3}>
              <p style={{ marginTop: 22, fontSize: 18, lineHeight: 1.65, maxWidth: 520, color: 'var(--gray-warm)', fontWeight: 400 }}>
                Cada gran recuerdo merece un abrazo aún más grande.<br />
                <span style={{ marginTop: 8, display: 'inline-block' }}>Damos vida a peluches gigantes que convierten tu historia en un recuerdo imposible de olvidar.</span>
              </p>
            </FadeUp>
            <FadeUp delay={0.4}>
              <div style={{ marginTop: 36, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={designHref} style={btnPrimary}>
                  Diseña tu peluche
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </Link>
                <Link href="/catalog" style={btnGhost}>Explorar catálogo</Link>
              </div>
            </FadeUp>
            <FadeUp delay={0.5}>
              <div style={{ marginTop: 40, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { icon: clockPath, text: '+2.400 peluches creados' },
                  { icon: truckPath, text: 'Envío a toda Colombia' },
                  { icon: shieldPath, text: 'Abono desde 30%, saldo contraentrega' },
                  { icon: heartPath, text: 'Convertimos tu peluche en gigante' },
                  { icon: sunPath, text: 'Creamos peluches para tu marca' },
                ].map(({ icon, text }, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--navy)', fontSize: 14, fontWeight: 600 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8"><path d={icon} /></svg>
                    {text}
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>
          <FadeIn delay={0.3} className="hidden md:block" style={{ position: 'relative', minHeight: 560 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', background: 'var(--pink-melo)' }}>
              <Image src={heroImage} alt="Peluche MIMITTOS" fill className="object-cover" />
            </div>
            <div className="anim-spin" style={{ position: 'absolute', top: '-16px', right: 40, width: 92, height: 92, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 13, lineHeight: 1.15, boxShadow: 'var(--shadow-md)', padding: 12 }}>
              Hecho<br />con<br />amor ♡
            </div>
            <div className="anim-floatA" style={{ position: 'absolute', top: 24, left: -30, background: '#fff', borderRadius: 'var(--radius-md)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-md)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--pink-melo)', display: 'grid', placeItems: 'center', color: 'var(--coral)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
              </div>
              <div>
                <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontSize: 15, color: 'var(--navy)', fontWeight: 700 }}>100% artesanal</strong>
                <span style={{ fontSize: 12, color: 'var(--gray-warm)' }}>Cosido a mano, uno por uno</span>
              </div>
            </div>
            <div className="anim-floatB" style={{ position: 'absolute', bottom: -30, right: -20, background: '#fff', borderRadius: 'var(--radius-md)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12, width: 240, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Tu peluche está listo 🧸</div>
              <div style={{ height: 6, background: 'var(--pink-melo)', borderRadius: 999, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: '66%', background: 'linear-gradient(90deg,var(--coral),var(--coral-soft))', borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-warm)', display: 'flex', justifyContent: 'space-between' }}>
                <span>En producción</span><b style={{ color: 'var(--terracotta)', fontWeight: 700 }}>Día 4 de 6</b>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* TRUST BAR */}
      <section style={{ background: '#fff', borderTop: '1px solid rgba(212,132,138,.08)', borderBottom: '1px solid rgba(212,132,138,.08)' }}>
        <StaggerContainer className="mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 items-center px-4 sm:px-8 lg:px-10 py-6 md:py-7" style={{ maxWidth: 1360 }}>
          {[
            { icon: shieldPath, title: 'Compra segura', sub: 'Pago por PSE, tarjeta o Nequi' },
            { icon: truckPath, title: 'Envío nacional', sub: 'A toda Colombia en 2-5 días' },
            { icon: clockPath, title: 'Produce en 6 días', sub: 'Hecho a mano pensando en ti' },
            { icon: chatPath, title: 'Estamos aquí', sub: 'Escríbenos por WhatsApp' },
          ].map(({ icon, title, sub }) => (
            <StaggerItem key={title} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--pink-melo)', color: 'var(--coral)', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={icon} /></svg>
              </div>
              <div>
                <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{title}</strong>
                <span className="hidden sm:block" style={{ fontSize: 12, color: 'var(--gray-warm)' }}>{sub}</span>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* CATEGORIES */}
      {featuredCategories.length > 0 && (
        <section className="mx-auto px-4 sm:px-8 lg:px-10 py-16 md:py-[100px]" style={{ maxWidth: 1360 }}>
          <FadeUp>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-6 mb-10 md:mb-12">
              <div>
                <div style={eyebrowStyle}>Explora por categoría</div>
                <h2 className="text-[32px] md:text-[46px]" style={h2StyleBase}>Cada peluche cuenta una historia diferente</h2>
              </div>
              <p className="hidden md:block" style={{ color: 'var(--gray-warm)', fontSize: 16, maxWidth: 420, lineHeight: 1.55 }}>
                Descubre nuestras categorías más queridas, diseñadas para convertir cada regalo en un recuerdo inolvidable.
              </p>
            </div>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
            {featuredCategories.map((cat) => (
              <StaggerItem key={cat.id}>
                <Link href={`/catalog?category=${cat.slug}`} style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', aspectRatio: '4/5', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', display: 'block', background: 'var(--pink-melo)' }}>
                  {cat.image_url ? (
                    <Image src={cat.image_url} alt={cat.name} fill className="object-cover" />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--pink-melo), var(--cream-peach))' }} />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 40%,rgba(27,42,74,.65))' }} />
                  <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, color: '#fff' }}>
                    <h3 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{cat.name}</h3>
                    {cat.description && <span style={{ fontSize: 12, opacity: .9 }}>{cat.description}</span>}
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>
      )}

      {/* FEATURED PRODUCTS */}
      {featuredPeluches.length > 0 && (
        <section className="mx-auto px-4 sm:px-8 lg:px-10 pb-16 md:pb-[100px]" style={{ maxWidth: 1360 }}>
          <FadeUp>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-10 md:mb-12">
              <div>
                <div style={eyebrowStyle}>Los más queridos</div>
                <h2 className="text-[32px] md:text-[46px]" style={h2StyleBase}>Peluches destacados de la semana</h2>
              </div>
              <Link href="/catalog" style={{ ...btnGhost, padding: '12px 22px', fontSize: 14 } as React.CSSProperties}>Ver todos →</Link>
            </div>
          </FadeUp>

          {/* Mobile: Swiper carousel */}
          <div data-testid="home-featured-carousel" className="block lg:hidden" style={{ paddingBottom: 36 }}>
            <Swiper
              className="home-carousel"
              modules={[Pagination]}
              slidesPerView={1.15}
              spaceBetween={14}
              pagination={{ clickable: true, renderBullet: (index, className) => `<button type="button" class="${className}" aria-label="Mostrar peluche ${index + 1}"></button>` }}
              style={{ paddingBottom: 52 }}
            >
              {featuredPeluches.map((p) => (
                <SwiperSlide key={p.id}>
                  <PeluchCard p={p} />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* Desktop: 4-column grid */}
          <StaggerContainer data-testid="home-featured-grid" className="hidden lg:grid lg:grid-cols-4 gap-5">
            {featuredPeluches.map((p) => (
              <StaggerItem key={p.id}>
                <PeluchCard p={p} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>
      )}

      {/* PROCESS */}
      <section style={{ background: 'var(--cream-peach)' }} className="py-16 md:py-[100px]">
        <div className="mx-auto px-4 sm:px-8 lg:px-10" style={{ maxWidth: 1360 }}>
          <FadeUp style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={eyebrowStyle}>Cómo funciona</div>
            <h2 className="text-[32px] md:text-[46px]" style={{ ...h2StyleBase, textAlign: 'center' }}>De tu idea al abrazo, en 4 momentos.</h2>
          </FadeUp>

          {/* Mobile: Swiper carousel */}
          <div className="block sm:hidden" style={{ paddingBottom: 40 }}>
            <Swiper
              className="home-carousel"
              modules={[Pagination]}
              slidesPerView={1.08}
              spaceBetween={14}
              centeredSlides
              pagination={{ clickable: true, renderBullet: (index, className) => `<button type="button" class="${className}" aria-label="Mostrar paso ${index + 1}"></button>` }}
              style={{ paddingBottom: 52 }}
            >
              {STEPS.map((step) => (
                <SwiperSlide key={step.n}>
                  <ProcessStepCard {...step} />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* Desktop: 4-column grid */}
          <StaggerContainer className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step) => (
              <StaggerItem key={step.n}>
                <ProcessStepCard {...step} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* STORY */}
      <section className="mx-auto px-4 sm:px-8 lg:px-10 py-16 md:py-[100px]" style={{ maxWidth: 1360 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-[70px] items-center">
          <SlideIn direction="left" className="hidden md:block" style={{ position: 'relative', aspectRatio: '4/5' }}>
            <div style={{ position: 'absolute', inset: '0 30px 30px 0', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
              <Image src="/mimittos/team/cortador.webp" alt="Cortando tela a mano en el taller MIMITTOS" fill className="object-cover" />
            </div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '60%', aspectRatio: '1/1', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '8px solid var(--cream-warm)', boxShadow: 'var(--shadow-lg)' }}>
              <Image src="/mimittos/team/costurero.webp" alt="Detalle del cosido a mano en el taller MIMITTOS" fill className="object-cover" />
            </div>
            <div style={{ position: 'absolute', top: 30, left: -20, background: '#fff', padding: '14px 20px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-md)' }}>
              <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--coral)', lineHeight: 1 }}>8<br /><span style={{ fontSize: 14 }}>años</span></div>
              <div style={{ fontSize: 12, color: 'var(--gray-warm)', lineHeight: 1.3 }}>creando<br />abrazos<br />a mano</div>
            </div>
          </SlideIn>
          <SlideIn direction="right">
            <div style={eyebrowStyle}>Nuestra historia</div>
            <h2 className="text-[32px] md:text-[46px]" style={h2StyleBase}>Más que peluches, guardianes de recuerdos.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--navy)', marginBottom: 18, fontWeight: 500 }}>
              MIMITTOS nació en un pequeño taller lleno de telas, hilos y sueños, donde cada peluche empieza con la misma pregunta: <em style={{ color: 'var(--coral)', fontStyle: 'normal', fontWeight: 600 }}>¿qué momento quieres recordar?</em>
            </p>
            <p style={{ color: 'var(--gray-warm)', fontSize: 15, lineHeight: 1.7, marginBottom: 14 }}>
              Cada pieza es cosida a mano, pensada para quien la va a abrazar. Sabemos que un peluche puede ser el primer amigo de un bebé, el regalo que une a dos personas, el recuerdo que acompaña una noche larga.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-8 pt-8" style={{ borderTop: '1px solid rgba(212,132,138,.2)' }}>
              {[['+ 2.400', 'peluches creados'], ['+1.800', 'familias felices'], ['4.9★', 'valoración media']].map(([num, label]) => (
                <div key={num}>
                  <strong style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--coral)', display: 'block', lineHeight: 1 }}>{num}</strong>
                  <span style={{ fontSize: 13, color: 'var(--gray-warm)' }}>{label}</span>
                </div>
              ))}
            </div>
            <Link href="/about" style={{ ...btnPrimary, display: 'inline-flex', marginTop: 32 } as React.CSSProperties}>Conoce nuestra historia →</Link>
          </SlideIn>
        </div>
      </section>

      {/* TESTIMONIALS — only renders when there are approved reviews */}
      {homeReviews.length > 0 && (
        <section style={{ background: 'linear-gradient(180deg,var(--cream-warm),var(--pink-melo) 100%)' }} className="py-16 md:py-[100px]">
          <div className="mx-auto px-4 sm:px-8 lg:px-10" style={{ maxWidth: 1360 }}>
            <FadeUp style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={eyebrowStyle}>Historias de abrazos</div>
              <h2 className="text-[32px] md:text-[46px]" style={{ ...h2StyleBase, textAlign: 'center' }}>Lo que dicen quienes ya tienen el suyo.</h2>
            </FadeUp>
            <StaggerContainer data-testid="home-reviews" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {homeReviews.map((r) => (
                <StaggerItem data-testid={`home-review-${r.id}`} className="min-w-0 [overflow-wrap:anywhere]" key={r.id} style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -18, left: 28, width: 44, height: 44, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28 }}>"</div>
                  <StarRating rating={r.rating} />
                  <p style={{ color: 'var(--navy)', fontSize: 15, lineHeight: 1.65, marginBottom: 24 }}>{r.comment}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed rgba(212,132,138,.2)', paddingTop: 18 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 18 }}>
                      {r.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <strong style={{ display: 'block', fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{r.user_name}</strong>
                      <span style={{ fontSize: 12, color: 'var(--gray-warm)' }}>{r.peluch_title}</span>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="mx-auto px-4 sm:px-8 lg:px-10 py-16 md:py-[100px]" style={{ maxWidth: 1360 }}>
        <FadeUp style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={eyebrowStyle}>Preguntas frecuentes</div>
          <h2 className="text-[32px] md:text-[46px]" style={{ ...h2StyleBase, textAlign: 'center' }}>Resolvemos tus dudas con cariño.</h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQS.map((faq, i) => (
            <div data-testid={`home-faq-${i}`} key={i} style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)', cursor: 'pointer' }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                <strong style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{faq.q}</strong>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: openFaq === i ? 'var(--coral)' : 'var(--pink-melo)', color: openFaq === i ? '#fff' : 'var(--coral)', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'transform .25s', transform: openFaq === i ? 'rotate(180deg)' : 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </div>
              {openFaq === i && <p style={{ marginTop: 14, fontSize: 14, color: 'var(--gray-warm)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{faq.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <FadeUp>
      <section className="mx-auto px-4 sm:px-8 mb-10 md:mb-[60px]" style={{ maxWidth: 1360 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-[60px] items-center rounded-[var(--radius-xl)] px-6 py-12 md:p-[70px]" style={{ background: 'var(--navy)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 90% 30%, rgba(212,132,138,.3), transparent 45%), radial-gradient(circle at 10% 80%, rgba(244,168,150,.25), transparent 50%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="text-[32px] md:text-[46px]" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, lineHeight: 1.08, letterSpacing: '-.02em', marginBottom: 16 }}>
              ¿Listo para crear un <em style={{ fontStyle: 'normal', color: 'var(--coral-soft)' }}>recuerdo</em> que abraza?
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, opacity: .82, marginBottom: 30, maxWidth: 440 }}>
              Diseña tu peluche en menos de 5 minutos. Sin mensajes, sin esperas, sin malentendidos.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href={designHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderRadius: 999, fontWeight: 600, fontSize: 15, background: '#fff', color: 'var(--navy)', transition: 'all .2s' }}>
                Diseñar mi peluche
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link href="/catalog" style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 24px', borderRadius: 999, fontWeight: 600, fontSize: 15, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,.25)' }}>
                Ver catálogo completo
              </Link>
            </div>
          </div>
          <div className="hidden md:flex" style={{ position: 'relative', zIndex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Image src="/mimittos/logo-light-big.png" alt="MIMITTOS" width={280} height={280} style={{ opacity: .95 }} />
          </div>
        </div>
      </section>
      </FadeUp>
      <style jsx global>{`
        .home-carousel .swiper-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }
        .home-carousel .swiper-pagination-bullet {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          margin: 0 !important;
          padding: 0;
          background: transparent !important;
          opacity: 1;
        }
        .home-carousel .swiper-pagination-bullet::after {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--coral);
          opacity: .3;
        }
        .home-carousel .swiper-pagination-bullet-active::after {
          opacity: 1;
        }
      `}</style>
    </main>
  )
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center',
  padding: '14px 24px', borderRadius: 999, fontWeight: 600, fontSize: 15,
  background: 'var(--coral)', color: '#fff',
  boxShadow: '0 8px 22px rgba(212,132,138,.35)', transition: 'all .2s',
}

const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center',
  padding: '14px 24px', borderRadius: 999, fontWeight: 600, fontSize: 15,
  color: 'var(--navy)', background: '#fff', border: '1.5px solid rgba(27,42,74,.08)',
  transition: 'all .2s',
}

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--coral)', fontFamily: "'Quicksand', sans-serif",
  fontWeight: 600, fontSize: 14, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 10,
}

const h2StyleBase: React.CSSProperties = {
  fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
  color: 'var(--navy)', lineHeight: 1.1, letterSpacing: '-.02em',
}

const heartPath = 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'
const sunPath = 'M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07-1.41 1.41M6.34 17.66l-1.41 1.41m12.72 0-1.41-1.41M6.34 6.34 4.93 4.93'
const truckPath = 'M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3h18z'
const shieldPath = 'M12 2 4 6v6c0 5 3.5 9.7 8 10 4.5-.3 8-5 8-10V6l-8-4z M9 12l2 2 4-4'
const clockPath = 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2'
const chatPath = 'M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'
