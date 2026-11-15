import { useCallback } from 'react';
import { useSettings } from '../state/settings';
import { RTL_LANGUAGES, translate } from './translate';

export { LANGUAGES, SPEECH_LOCALES, translate, pickLanguage } from './translate';

/** Hook: `const { t, lang, isRTL } = useT();` re-renders when the language changes. */
export function useT() {
  const lang = useSettings((s) => s.language);
  const t = useCallback((key, params) => translate(lang, key, params), [lang]);
  return { t, lang, isRTL: RTL_LANGUAGES.has(lang) };
}
