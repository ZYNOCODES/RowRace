import { DICTS, pickLanguage, translate } from './translate';

/** Flattens nested dictionaries into dotted keys. */
function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`),
  );
}

test('fr and ar define every English key', () => {
  const en = keys(DICTS.en).sort();
  expect(keys(DICTS.fr).sort()).toEqual(en);
  expect(keys(DICTS.ar).sort()).toEqual(en);
});

test('params and fallbacks', () => {
  expect(translate('fr', 'results.autoHome', { seconds: 7 })).toBe('Accueil dans 7 s');
  expect(translate('xx', 'home.race')).toBe('Race');
  expect(translate('en', 'no.such.key')).toBe('no.such.key');
});

test('device locale → supported language', () => {
  expect(pickLanguage('fr-CA')).toBe('fr');
  expect(pickLanguage('ar')).toBe('ar');
  expect(pickLanguage('de-DE')).toBe('en');
  expect(pickLanguage(null)).toBe('en');
});
