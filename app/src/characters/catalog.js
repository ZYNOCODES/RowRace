/**
 * Character library: generated catalog (tools/characters/convert.mjs) + bundled assets.
 * A character is either bundled in the APK (works offline) or downloaded on demand from
 * `url` into the app's documents folder (characterCache.js).
 */
import catalogJson from './catalog.json';
import bundled from './bundled';

/**
 * @typedef {Object} CharacterEntry
 * @property {string} id
 * @property {string} name
 * @property {'mixamo'|'cc0'} origin
 * @property {string} license
 * @property {boolean} bundled
 * @property {string|null} url remote GLB (null for bundled, or not hosted yet)
 * @property {number} bytes
 * @property {number} triangles
 */

/** Special id for the built-in procedural rower (no model to load). */
export const CLASSIC_ID = 'classic';

/** @returns {CharacterEntry[]} */
export function listCharacters() {
  return catalogJson.characters;
}

/** @param {string} id @returns {CharacterEntry | null} */
export function getCharacter(id) {
  return catalogJson.characters.find((c) => c.id === id) ?? null;
}

/** Asset module for a bundled character (for useLoader / expo-asset), else null. */
export function bundledModule(id) {
  return bundled[id] ?? null;
}

/** First bundled character: the default choice on a fresh install. */
export function defaultCharacterId() {
  return catalogJson.characters.find((c) => c.bundled)?.id ?? CLASSIC_ID;
}
