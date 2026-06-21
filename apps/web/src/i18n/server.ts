import 'server-only';
import { cookies } from 'next/headers';
import { createTranslation } from './index';
import { COOKIE_NAME, fallbackLng, isLocale, type Locale } from './settings';

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return isLocale(value) ? value : fallbackLng;
}

export async function getServerTranslation(ns: string | string[] = 'common') {
  const lng = await getLocale();
  return createTranslation(lng, ns);
}
