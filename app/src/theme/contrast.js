/** WCAG 2.x relative luminance / contrast ratio helpers. */

/** @param {string} hex "#RRGGBB" */
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** @param {string} fg @param {string} bg @returns {number} ratio ≥ 1 */
export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Composites an rgba() glass color over an opaque hex background. */
export function flatten(rgba, bgHex) {
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgba;
  const [r, g, b, a = 1] = m[1].split(',').map((s) => Number(s.trim()));
  const bg = parseInt(bgHex.replace('#', ''), 16);
  const mix = (c, s) => Math.round(c * a + s * (1 - a));
  const out = [mix(r, (bg >> 16) & 255), mix(g, (bg >> 8) & 255), mix(b, bg & 255)];
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
