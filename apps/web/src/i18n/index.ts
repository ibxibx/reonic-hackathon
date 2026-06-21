import { createInstance, type i18n as I18nInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { getOptions, type Locale } from './settings';

async function initI18next(lng: Locale, ns: string | string[]) {
  const instance = createInstance();
  await instance
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`./locales/${language}/${namespace}.json`),
      ),
    )
    .init(getOptions(lng, Array.isArray(ns) ? ns[0] : ns));
  return instance;
}

export async function createTranslation(
  lng: Locale,
  ns: string | string[] = 'common',
): Promise<{ t: I18nInstance['t']; i18n: I18nInstance }> {
  const i18nextInstance = await initI18next(lng, ns);
  return {
    t: i18nextInstance.getFixedT(
      lng,
      Array.isArray(ns) ? ns[0] : ns,
    ),
    i18n: i18nextInstance,
  };
}
