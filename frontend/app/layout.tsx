import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import PublicChrome from '@/components/layout/PublicChrome';
import Providers from './providers';

const SITE_URL = 'https://mimittos.com';
const GTM_ID = 'GTM-K88JC5VS';

export const viewport: Viewport = {
  themeColor: '#D4848A',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'MIMITTOS — Peluches artesanales personalizados | Hecho con amor en Colombia',
    template: '%s · MIMITTOS',
  },
  description:
    'Diseña tu peluche personalizado en MIMITTOS: eliges modelo, tamaño y color, abonas desde el 30% y lo recibes hecho a mano en 4 a 6 días. Envíos a toda Colombia.',
  applicationName: 'MIMITTOS',
  keywords: [
    'peluches personalizados', 'peluches artesanales', 'peluches hechos a mano',
    'peluches Colombia', 'regalo personalizado', 'oso de peluche',
    'peluche con audio', 'peluche con huella', 'MIMITTOS',
    'peluche aniversario', 'peluche bebé',
  ],
  authors: [{ name: 'MIMITTOS', url: SITE_URL }],
  creator: 'MIMITTOS',
  publisher: 'MIMITTOS',
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    url: SITE_URL,
    siteName: 'MIMITTOS',
    title: 'MIMITTOS — Peluches artesanales personalizados',
    description:
      'Más que un peluche, un recuerdo. Diseñas, abonas desde el 30% y recibes tu peluche hecho a mano en 4 a 6 días.',
    images: [
      {
        url: '/mimittos/logo-dark-big.png',
        width: 1200,
        height: 630,
        alt: 'MIMITTOS — Peluches artesanales personalizados',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MIMITTOS — Peluches artesanales personalizados',
    description: 'Más que un peluche, un recuerdo. Hecho con amor en Colombia.',
    images: ['/mimittos/logo-dark-big.png'],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  category: 'shopping',
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'MIMITTOS',
  legalName: 'CG HOLDING SAS.',
  url: SITE_URL,
  logo: `${SITE_URL}/mimittos/logo-dark-big.png`,
  email: 'hola@mimittos.com',
  telephone: '+57 3244790777',
  description:
    'Peluches artesanales personalizados hechos a mano en Bogotá, Colombia. Diseñas tu peluche y lo recibes en 4 a 6 días.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Calle 49 B Sur #5B-93',
    addressLocality: 'Bogotá',
    addressRegion: 'Cundinamarca',
    addressCountry: 'CO',
  },
  contactPoint: [{
    '@type': 'ContactPoint',
    telephone: '+57 3244790777',
    contactType: 'customer service',
    areaServed: 'CO',
    availableLanguage: ['Spanish'],
  }],
  sameAs: ['https://wa.me/573244790777'],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'MIMITTOS',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/catalog?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/__hosting/notice.css" />
        <Script src="/__hosting/notice.js" strategy="beforeInteractive" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Nunito:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <Providers>
          <PublicChrome>
            {children}
          </PublicChrome>
        </Providers>
        {/* Google Tag Manager */}
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
        {/* End Google Tag Manager */}
        <Script id="org-jsonld" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify(organizationJsonLd)}
        </Script>
        <Script id="website-jsonld" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify(websiteJsonLd)}
        </Script>
      </body>
    </html>
  );
}
