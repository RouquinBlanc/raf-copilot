/**
 * gpx.js — parse a GPX file into track points and waypoints.
 *
 * Uses the browser's native DOMParser (no external library).
 * Handles GPX 1.1 as produced by Komoot / gpx.studio.
 */

/**
 * @typedef {Object} TrackPoint
 * @property {number} lat
 * @property {number} lon
 * @property {number} ele  — elevation in metres
 */

/**
 * @typedef {Object} Waypoint
 * @property {number} lat
 * @property {number} lon
 * @property {number} ele       — elevation in metres (0 if missing)
 * @property {string} name      — display name, e.g. "Eau potable"
 * @property {string} sym       — symbol category, e.g. "Drinking Water"
 * @property {string} desc      — full description / OSM tags
 * @property {number} routeKm   — distance from start along route (set by route.js)
 */

/**
 * Parse a GPX string and return track points + waypoints.
 *
 * @param {string} gpxText  — raw GPX file content
 * @returns {{ track: TrackPoint[], waypoints: Waypoint[], parseError: string|null }}
 */
export function parseGpx(gpxText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(gpxText, 'application/xml')

  // Check for parse errors (DOMParser wraps errors in <parsererror>)
  const parseErrorEl = doc.querySelector('parsererror')
  if (parseErrorEl) {
    return { track: [], waypoints: [], parseError: parseErrorEl.textContent }
  }

  // ── Track points ──────────────────────────────────────────────────────────
  const trkptEls = doc.querySelectorAll('trkpt')
  const track = []
  for (const el of trkptEls) {
    const lat = parseFloat(el.getAttribute('lat'))
    const lon = parseFloat(el.getAttribute('lon'))
    if (!isNaN(lat) && !isNaN(lon)) {
      const ele = parseFloat(el.querySelector('ele')?.textContent ?? '0') || 0
      track.push({ lat, lon, ele })
    }
  }

  // ── Waypoints ─────────────────────────────────────────────────────────────
  const wptEls = doc.querySelectorAll('wpt')
  const waypoints = []
  for (const el of wptEls) {
    const lat = parseFloat(el.getAttribute('lat'))
    const lon = parseFloat(el.getAttribute('lon'))
    if (isNaN(lat) || isNaN(lon)) continue

    const name = el.querySelector('name')?.textContent?.trim() ?? '(sans nom)'
    const sym  = normaliseSym(el.querySelector('sym')?.textContent?.trim() ?? '')
    const desc = el.querySelector('desc')?.textContent?.trim() ?? ''
    const ele  = parseFloat(el.querySelector('ele')?.textContent ?? '0') || 0

    waypoints.push({ lat, lon, ele, name, sym, desc, routeKm: 0 })
  }

  return { track, waypoints, parseError: null }
}

/**
 * Normalise raw GPX <sym> values into a canonical category string.
 * Unknown values fall back to "Other".
 */
function normaliseSym(raw) {
  const known = [
    'Drinking Water',
    'Convenience Store',
    'Restroom',
    'Restaurant',
    'Flag, Blue',
  ]
  if (known.includes(raw)) return raw
  if (!raw) return 'Other'
  return 'Other'  // Map any unknown sym to "Other" so it's still visible
}

/**
 * Build a lightweight fingerprint for version-checking the cached data.
 * Combines file byte-length with the first 64 characters of content.
 *
 * @param {string} gpxText
 * @returns {string}
 */
export function gpxFingerprint(gpxText) {
  return `${gpxText.length}:${gpxText.slice(0, 64)}`
}
