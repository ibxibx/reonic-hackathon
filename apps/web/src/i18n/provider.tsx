'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18next, { setClientLanguage } from './client';
import type { Locale } from './settings';

export function I18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: Locale;
}) {
  const [ready, setReady] = useState(i18next.language === locale);

  useEffect(() => {
    setClientLanguage(locale);
    setReady(true);
  }, [locale]);

  if (!ready) {
    // Ensure first paint matches the server-rendered locale.
    setClientLanguage(locale);
  }

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
