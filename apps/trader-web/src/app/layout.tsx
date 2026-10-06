import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'QuantroApex — Autonomous AI Trading',
  description:
    'QuantroApex is an autonomous AI trading system that learns from every trade, evolves its own strategies, and operates around the clock.',
  keywords: ['AI trading', 'autonomous trading', 'stock market', 'trading platform', 'QuantroApex'],
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'QuantroApex',
    description: 'Trade smarter. Let it learn.',
    type: 'website',
  },
};

import { SplashLoader } from '@/components/common/SplashLoader';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="h-full antialiased" suppressHydrationWarning>
        <Providers>
          <SplashLoader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
