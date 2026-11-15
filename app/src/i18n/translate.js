/** Pure translation lookup (no React) so it can be unit-tested and used outside components. */
import en from './en';
import fr from './fr';
import ar from './ar';

export const LANGUAGES = /** @type {const} */ (['en', 'fr', 'ar']);
export const RTL_LANGUAGES = new Set(['ar']);
/** BCP-47 tags for expo-speech voices. */
export const SPEECH_LOCALES = { en: 'en-US', fr: 'fr-FR', ar: 'ar-SA' };

const DICTS = { en, fr, ar };

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

/**
 * @param {string} lang
 * @param {string} key dotted path, e.g. "home.race"
 * @param {Record<string, string|number>} [params] replaces {{name}}
 * @returns {string} falls back to English, then to the key itself
 */
export function translate(lang, key, params) {
  let s = lookup(DICTS[lang] || en, key);
  if (typeof s !== 'string') s = lookup(en, key);
  if (typeof s !== 'string') return key;
  if (!params) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in params ? String(params[k]) : `{{${k}}}`));
}

/** @param {string | undefined | null} tag device locale like "fr-FR" */
export function pickLanguage(tag) {
  const base = String(tag || '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(base) ? base : 'en';
}

export { DICTS };
