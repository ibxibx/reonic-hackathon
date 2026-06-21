import '@/styles/globals.css';
import { Suspense } from 'react';
import localFont from 'next/font/local';
import { DynamicLayoutProviders } from './DynamicLayoutProviders';
import { ClientLayout } from './ClientLayout';
import { I18nProvider } from '@/i18n/provider';
import { getLocale } from '@/i18n/server';
import { fallbackLng } from '@/i18n/settings';

const inter = localFont({
  src: [
    { path: '../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

const robotoMono = localFont({
  src: [
    { path: '../../node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-roboto-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Nextbase Open source starter',
  description: 'Built with Next.js, Supabase, and Tailwind CSS',
};

async function LocalizedProviders({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={fallbackLng} suppressHydrationWarning className={`${inter.variable} ${robotoMono.variable}`}>
      <head />
      <body>
        <Suspense
          fallback={
            <I18nProvider locale={fallbackLng}>
              <DynamicLayoutProviders>
                <ClientLayout>{children}</ClientLayout>
              </DynamicLayoutProviders>
            </I18nProvider>
          }
        >
          <LocalizedProviders>
            <DynamicLayoutProviders>
              <ClientLayout>
                {children}
              </ClientLayout>
            </DynamicLayoutProviders>
          </LocalizedProviders>
        </Suspense>
      </body>
    </html>
  );
}
