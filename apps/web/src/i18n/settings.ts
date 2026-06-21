export const COOKIE_NAME = 'i18next';
export const fallbackLng = 'en';
export const languages = ['en', 'de'] as const;
export type Locale = (typeof languages)[number];
export const defaultNS = 'common';

export const languageNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (languages as readonly string[]).includes(value);
}

export function getOptions(lng: Locale = fallbackLng, ns: string = defaultNS) {
  return {
    supportedLngs: languages,
    fallbackLng,
    lng,
    fallbackNS: defaultNS,
    defaultNS,
    ns,
  };
}
