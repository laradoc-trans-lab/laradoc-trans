import i18next from 'i18next';
import i18nextFsBackend from 'i18next-fs-backend';
import I18nextCLILanguageDetector from 'i18next-cli-language-detector';
import path from 'path';

export async function initI18n() {
  await i18next
    .use(i18nextFsBackend)
    .use(I18nextCLILanguageDetector)
    .init({
      fallbackLng: 'en',
      debug: false, // Keep debug true for now, user can disable later
      backend: {
        loadPath: path.join(__dirname, '..', 'resources', 'i18n', '{{lng}}.json'),
      },
      interpolation: {
        escapeValue: false,
      },
      keySeparator: false,
      nsSeparator: false,

    });
}

export const _ = i18next.t;

export function getLanguage(): string {
  return i18next.language;
}