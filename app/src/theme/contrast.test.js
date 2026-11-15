import { colors } from './tokens';
import { contrastRatio, flatten } from './contrast';

const backgrounds = {
  background: colors.background,
  surface: colors.surface,
  elevated: colors.elevated,
};

describe('WCAG AA (4.5:1) for every text/background pair', () => {
  const texts = ['text', 'textSecondary', 'primary', 'accent', 'success', 'danger', 'warning'];
  for (const [bgName, bg] of Object.entries(backgrounds)) {
    for (const t of texts) {
      test(`${t} on ${bgName}`, () => {
        expect(contrastRatio(colors[t], bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  test.each(['primary', 'primaryDeep', 'accent', 'success', 'warning', 'danger'])(
    'onFill text on %s',
    (fill) => {
      expect(contrastRatio(colors.onFill, colors[fill])).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('race numbers aim for 7:1', () => {
  // Glass over a bright sky is the worst case for the HUD; check over white-ish sky.
  const brightSky = '#BFE6F5';
  test.each(['text', 'accent', 'primary'])('%s on glassStrong over bright sky', (t) => {
    const bg = flatten(colors.glassStrong, brightSky);
    const min = t === 'text' ? 7 : 4.5;
    expect(contrastRatio(colors[t], bg)).toBeGreaterThanOrEqual(min);
  });
  test('text on background', () => {
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(7);
  });
});
