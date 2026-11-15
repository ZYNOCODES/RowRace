/**
 * The three procedural maps. Everything visual that differs between maps lives here, so the
 * builders (sky, water, scenery, course) stay generic. Colors are hex strings.
 */

/**
 * @typedef {Object} MapDef
 * @property {string} id
 * @property {string} nameKey i18n key
 * @property {string} moodKey
 * @property {1|2|3} difficulty shown on the map card
 * @property {{ top: string, horizon: string, ground: string }} sky
 * @property {{ deep: string, shallow: string, reflect: string, foam: string, sparkle: number }} water
 * @property {{ color: string, near: number, far: number }} fog
 * @property {{ dir: [number, number, number], color: string, intensity: number,
 *   hemiSky: string, hemiGround: string, hemiIntensity: number }} light
 * @property {'mountains'|'dunes'|'skyline'} backdrop
 * @property {'pines'|'palms'|'none'} trees
 * @property {string} shore
 * @property {{ buoy: string, buoyAlt: string, marker: string, emissive: boolean }} course
 * @property {boolean} stars
 * @property {string[]} card gradient for the 2D preview card
 */

/** @type {Record<string, MapDef>} */
export const MAPS = {
  alpine: {
    id: 'alpine',
    nameKey: 'maps.alpine',
    moodKey: 'maps.alpineMood',
    difficulty: 1,
    sky: { top: '#3E8FD6', horizon: '#CFE8F5', ground: '#9CC7DA' },
    water: {
      deep: '#0A5866',
      shallow: '#1AA3AD',
      reflect: '#86C3D6',
      foam: '#E8F7FC',
      sparkle: 0.9,
    },
    fog: { color: '#CFE3EE', near: 250, far: 1500 },
    light: {
      dir: [-0.4, 0.8, -0.45],
      color: '#FFF6E5',
      intensity: 1.6,
      hemiSky: '#D8EEFF',
      hemiGround: '#3C5A3A',
      hemiIntensity: 1.1,
    },
    backdrop: 'mountains',
    backdropColors: ['#8AA3B3', '#65808F', '#47616F'],
    snow: '#EEF3F7',
    snowLine: 0.78,
    trees: 'pines',
    treeColors: { trunk: '#5A3E2B', leaves: '#1F5A3A', leavesAlt: '#2E6E44' },
    shore: '#5E8A45',
    course: { buoy: '#F8FAFC', buoyAlt: '#FF7A1A', marker: '#0A0F1C', emissive: false },
    stars: false,
    card: ['#3E8FD6', '#22B8BF', '#0B5F6B'],
  },
  desert: {
    id: 'desert',
    nameKey: 'maps.desert',
    moodKey: 'maps.desertMood',
    difficulty: 2,
    sky: { top: '#D9653B', horizon: '#FFD08A', ground: '#F3B66C' },
    water: {
      deep: '#123F4D',
      shallow: '#2F7F86',
      reflect: '#FFC36B',
      foam: '#FFF4E0',
      sparkle: 1.4,
    },
    fog: { color: '#F6C68A', near: 220, far: 1300 },
    light: {
      dir: [0.55, 0.28, -0.8],
      color: '#FFC77A',
      intensity: 1.8,
      hemiSky: '#FFD9A8',
      hemiGround: '#8A5A2E',
      hemiIntensity: 0.9,
    },
    backdrop: 'dunes',
    backdropColors: ['#E3A963', '#CF8E4C', '#B5733A'],
    snow: null,
    trees: 'palms',
    treeColors: { trunk: '#7A5230', leaves: '#3F7A34', leavesAlt: '#2F6A2C' },
    shore: '#D9AE70',
    course: { buoy: '#FFF4E0', buoyAlt: '#E04E2B', marker: '#3A2412', emissive: false },
    stars: false,
    card: ['#D9653B', '#FFB067', '#123F4D'],
  },
  night: {
    id: 'night',
    nameKey: 'maps.night',
    moodKey: 'maps.nightMood',
    difficulty: 3,
    sky: { top: '#03050D', horizon: '#1B2148', ground: '#0B1028' },
    water: {
      deep: '#030814',
      shallow: '#0A1830',
      reflect: '#1C2752',
      foam: '#6FCFE2',
      sparkle: 0.6,
    },
    fog: { color: '#0E1230', near: 200, far: 1200 },
    light: {
      dir: [0.2, 0.9, 0.3],
      color: '#9DB3FF',
      intensity: 0.5,
      hemiSky: '#3A4380',
      hemiGround: '#05070F',
      hemiIntensity: 0.9,
    },
    backdrop: 'skyline',
    backdropColors: ['#121A2B', '#0E1524', '#0A0F1C'],
    windows: '#FBBF24',
    snow: null,
    trees: 'none',
    treeColors: null,
    shore: '#0A0F1C',
    course: { buoy: '#22D3EE', buoyAlt: '#FF7A1A', marker: '#22D3EE', emissive: true },
    neon: ['#22D3EE', '#E040FB', '#FF7A1A'],
    stars: true,
    card: ['#03050D', '#1B2148', '#22D3EE'],
  },
};

export const MAP_IDS = Object.keys(MAPS);

/** Colors for up to 4 pace boats / ghost (distinct from the user's primary color). */
export const BOAT_COLORS = {
  user: '#22D3EE',
  opponents: ['#FF7A1A', '#E040FB', '#4ADE80', '#FBBF24'],
};

/** @param {string} id */
export function getMap(id) {
  return MAPS[id] || MAPS.alpine;
}
