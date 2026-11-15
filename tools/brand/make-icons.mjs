#!/usr/bin/env node
/**
 * Renders the app's original logo (stylized scull with oars over a wave) to the PNGs Expo
 * needs: app/assets/brand/{icon,adaptive-foreground,splash}.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'app/assets/brand');
const C = {
  bg: '#0A0F1C',
  bg2: '#121A2B',
  cyan: '#22D3EE',
  deep: '#0EA5B7',
  orange: '#FF7A1A',
  white: '#F8FAFC',
};

/** The mark, drawn in a 1024 box; `scale` shrinks it around the center (adaptive icon safe zone). */
const mark = (scale = 1) => `
<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
  <path d="M150 640 C 290 560, 400 720, 540 640 S 790 560, 874 640" fill="none" stroke="${C.deep}" stroke-width="44" stroke-linecap="round"/>
  <path d="M150 740 C 290 660, 400 820, 540 740 S 790 660, 874 740" fill="none" stroke="${C.cyan}" stroke-width="30" stroke-linecap="round" opacity="0.55"/>
  <path d="M262 520 Q 512 470 762 520 Q 512 560 262 520 Z" fill="${C.white}"/>
  <line x1="300" y1="330" x2="724" y2="690" stroke="${C.white}" stroke-width="22" stroke-linecap="round"/>
  <line x1="724" y1="330" x2="300" y2="690" stroke="${C.white}" stroke-width="22" stroke-linecap="round"/>
  <rect x="236" y="276" width="110" height="46" rx="18" transform="rotate(40 291 299)" fill="${C.cyan}"/>
  <rect x="678" y="276" width="110" height="46" rx="18" transform="rotate(-40 733 299)" fill="${C.cyan}"/>
  <circle cx="512" cy="420" r="58" fill="${C.orange}"/>
</g>`;

const svg = (
  body,
  background = true,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${C.bg2}"/><stop offset="1" stop-color="${C.bg}"/></radialGradient></defs>
  ${background ? '<rect width="1024" height="1024" fill="url(#g)"/>' : ''}
  ${body}
</svg>`;

fs.mkdirSync(OUT, { recursive: true });
await sharp(Buffer.from(svg(mark(0.92))))
  .png()
  .toFile(path.join(OUT, 'icon.png'));
// Android adaptive icon: the launcher crops to ~66% of the canvas, so keep the mark inside it.
await sharp(Buffer.from(svg(mark(0.62), false)))
  .png()
  .toFile(path.join(OUT, 'adaptive-foreground.png'));
await sharp(Buffer.from(svg(mark(0.8), false)))
  .png()
  .toFile(path.join(OUT, 'splash.png'));
console.log('wrote icon.png, adaptive-foreground.png, splash.png');
