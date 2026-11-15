/** Display / parsing helpers shared by the app, the simulator CLI and logs. */

/**
 * @param {number | null | undefined} sec pace in s/500 m
 * @param {{ tenths?: boolean }} [opts]
 * @returns {string} "2:05" or "2:05.3"; "--:--" when unknown
 */
function formatPace(sec, opts = {}) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '--:--';
  return formatTime(sec, opts);
}

/**
 * @param {number} sec
 * @param {{ tenths?: boolean }} [opts]
 * @returns {string} "m:ss", "h:mm:ss", or with ".t" tenths
 */
function formatTime(sec, opts = {}) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) sec = 0;
  const total = opts.tenths ? Math.floor(sec * 10) / 10 : Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const t = Math.round((total - Math.floor(total)) * 10);
  const ss = String(s).padStart(2, '0');
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return opts.tenths ? `${body}.${t}` : body;
}

/**
 * Parses "2:05", "2:05.5", "125" or "1:02:03" into seconds.
 * @param {string | number} text
 * @returns {number | null}
 */
function parseTime(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const parts = String(text).trim().split(':');
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => p === '' || isNaN(Number(p)))) {
    return null;
  }
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** @param {number} meters @returns {string} "850 m" or "1.25 km" */
function formatDistance(meters) {
  const m = Math.max(0, Number(meters) || 0);
  return m < 1000 ? `${Math.floor(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

module.exports = { formatPace, formatTime, parseTime, formatDistance };
