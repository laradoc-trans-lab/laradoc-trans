import i18next from 'i18next';
import i18nextFsBackend from 'i18next-fs-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import path from 'path';

export async function initI18n() {
  await i18next
    .use(i18nextFsBackend)
    .use(LanguageDetector)
    .init({
      fallbackLng: 'en',
      debug: true, // Keep debug true for now, user can disable later
      backend: {
        loadPath: path.join(__dirname, 'i18n/{{lng}}.json'),
      },
      interpolation: {
        escapeValue: false,
      },
      keySeparator: false,
      nsSeparator: false,
    });
}

export const _ = i18next.t;