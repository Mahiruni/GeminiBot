import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Obsidian Quant Terminal',
  description: 'Institutional-Grade Mobile Algorithmic Terminal for Pocket Option',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-obsidian-bg text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
