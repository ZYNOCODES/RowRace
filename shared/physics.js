/**
 * Concept2 rowing relations.
 * Source: "Concept2 PM CSAFE Communication Definition" rev 0.31, Appendix B "Pace Conversions":
 *   Watts       = 2.8 / pace³                          (pace in s/m)
 *   Calories/Hr = (2.8 / pace³) * (4.0 * 0.8604) + 300  (pace in s/m)
 *   Pace/500m   = pace * 500
 * The same formulas are published on concept2.com (pace / watts calculator).
 */

const WATTS_K = 2.8;
const KCAL_PER_HOUR_PER_WATT = 4.0 * 0.8604;
const KCAL_BASE_PER_HOUR = 300.0;

/** @param {number} speed m/s @returns {number | null} s per 500 m, null when not moving */
function paceFromSpeed(speed) {
  return speed > 0 && Number.isFinite(speed) ? 500 / speed : null;
}

/** @param {number | null} pace500 s per 500 m @returns {number} m/s (0 when no pace) */
function speedFromPace(pace500) {
  return pace500 > 0 && Number.isFinite(pace500) ? 500 / pace500 : 0;
}

/** @param {number | null} pace500 s per 500 m @returns {number} W */
function wattsFromPace(pace500) {
  if (!(pace500 > 0) || !Number.isFinite(pace500)) return 0;
  const perMeter = pace500 / 500;
  return WATTS_K / (perMeter * perMeter * perMeter);
}

/** @param {number} speed m/s @returns {number} W */
function wattsFromSpeed(speed) {
  return speed > 0 ? WATTS_K * speed * speed * speed : 0;
}

/** @param {number} watts @returns {number | null} s per 500 m */
function paceFromWatts(watts) {
  if (!(watts > 0)) return null;
  return Math.cbrt(WATTS_K / watts) * 500;
}

/** @param {number} watts @returns {number} kcal/hr (300 at rest, per Concept2) */
function caloriesPerHourFromWatts(watts) {
  return Math.max(0, watts) * KCAL_PER_HOUR_PER_WATT + KCAL_BASE_PER_HOUR;
}

/** @param {number | null} pace500 @returns {number} kcal/hr */
function caloriesPerHourFromPace(pace500) {
  return caloriesPerHourFromWatts(wattsFromPace(pace500));
}

/** @param {number} speed m/s */
const msToKmh = (speed) => speed * 3.6;

module.exports = {
  paceFromSpeed,
  speedFromPace,
  wattsFromPace,
  wattsFromSpeed,
  paceFromWatts,
  caloriesPerHourFromWatts,
  caloriesPerHourFromPace,
  msToKmh,
};
