import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegistrarSW from '@/components/RegistrarSW';

export const metadata: Metadata = {
  title: 'Finanças',
  description: 'Gestão de banca: clientes, contratos e caixa.',
  manifest: '/manifest.json',
  applicationName: 'Finanças',
  appleWebApp: { capable: true, title: 'Finanças', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-black text-white antialiased tabular-nums">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
