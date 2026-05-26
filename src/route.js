/**
 * route.js — geospatial maths for the RAF Copilot.
 *
 * No external libraries. Pure Haversine + dot-product projection.
 *
 * Coordinate convention throughout: { lat, lon } in decimal degrees.
 */

const EARTH_RADIUS_M = 6_371_000  // metres

/** Degrees → radians */
const rad = (d) => (d * Math.PI) / 180

/**
 * Haversine great-circle distance in metres.
 * Accurate to ~0.1% for distances under 1000 km.
 *
 * @param {number} lat1 @param {number} lon1
 * @param {number} lat2 @param {number} lon2
 * @returns {number} distance in metres
 */
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/**
 * Build the cumulative-distance array (metres) for an ordered track.
 *
 * cumKm[0] = 0, cumKm[i] = cumKm[i-1] + distance(track[i-1], track[i])
 *
 * @param {Array<{lat:number,lon:number}>} track
 * @returns {Float64Array} cumulative distances in metres, same length as track
 */
export function buildCumDistances(track) {
  const cum = new Float64Array(track.length)
  for (let i = 1; i < track.length; i++) {
    const { lat: la, lon: lo } = track[i - 1]
    const { lat: lb, lon: lb2 } = track[i]
    cum[i] = cum[i - 1] + haversineM(la, lo, lb, lb2)
  }
  return cum
}

/**
 * Snap each waypoint to the nearest track point and assign `routeKm`.
 *
 * Uses a cosine-latitude-corrected squared Euclidean scan (no sqrt needed
 * for finding the minimum). Then refines with sub-segment interpolation
 * on the two adjacent segments for sub-45m precision.
 *
 * @param {Array<{lat,lon,routeKm}>} waypoints   mutated in-place
 * @param {Array<{lat,lon}>}         track
 * @param {Float64Array}             cumM         from buildCumDistances
 */
export function snapWaypointsToRoute(waypoints, track, cumM) {
  for (const wpt of waypoints) {
    const idx = nearestTrackIndex(wpt.lat, wpt.lon, track)
    // Refine: project onto adjacent segments and take the best result
    const km = interpolateRouteKm(wpt.lat, wpt.lon, track, cumM, idx)
    wpt.routeKm = km
  }
  waypoints.sort((a, b) => a.routeKm - b.routeKm)
}

/**
 * O(n) nearest-track-point scan.
 * Returns the index of the nearest track point (not the interpolated position).
 *
 * Uses squared Euclidean distance in degrees (cosine-corrected for longitude)
 * which avoids the expensive sqrt and is monotone with great-circle distance
 * for small areas.
 *
 * @param {number} lat  @param {number} lon
 * @param {Array<{lat,lon}>} track
 * @returns {number} index
 */
export function nearestTrackIndex(lat, lon, track) {
  const cosLat = Math.cos(rad(lat))
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < track.length; i++) {
    const dLat = track[i].lat - lat
    const dLon = (track[i].lon - lon) * cosLat
    const d2 = dLat * dLat + dLon * dLon
    if (d2 < bestDist) {
      bestDist = d2
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Given a GPS position and the index of its nearest track point,
 * project onto the two adjacent segments and return the interpolated routeKm.
 *
 * @param {number} lat  @param {number} lon
 * @param {Array<{lat,lon}>} track
 * @param {Float64Array} cumM
 * @param {number} nearestIdx
 * @returns {number} routeKm
 */
function interpolateRouteKm(lat, lon, track, cumM, nearestIdx) {
  let bestKm = cumM[nearestIdx] / 1000
  let bestDistM = haversineM(lat, lon, track[nearestIdx].lat, track[nearestIdx].lon)

  // Check segments: [nearestIdx-1 → nearestIdx] and [nearestIdx → nearestIdx+1]
  const candidates = [nearestIdx - 1, nearestIdx].filter(
    (i) => i >= 0 && i + 1 < track.length
  )
  for (const i of candidates) {
    const A = track[i]
    const B = track[i + 1]
    const result = projectOntoSegment(lat, lon, A, B, cumM[i], cumM[i + 1])
    if (result.distM < bestDistM) {
      bestDistM = result.distM
      bestKm = result.km
    }
  }
  return bestKm
}

/**
 * Project point P=(lat,lon) onto segment A→B in geographic coordinates.
 * Returns the interpolated cumulative km and perpendicular distance.
 *
 * @param {number} pLat @param {number} pLon
 * @param {{lat,lon}} A   @param {{lat,lon}} B
 * @param {number} cumMA  cumulative distance in metres at A
 * @param {number} cumMB  cumulative distance in metres at B
 * @returns {{ km: number, distM: number }}
 */
function projectOntoSegment(pLat, pLon, A, B, cumMA, cumMB) {
  // Work in degree-space with cosine correction for lon
  const cosLat = Math.cos(rad((A.lat + B.lat) / 2))

  const ax = A.lon * cosLat, ay = A.lat
  const bx = B.lon * cosLat, by = B.lat
  const px = pLon * cosLat, py = pLat

  const abx = bx - ax, aby = by - ay
  const apx = px - ax, apy = py - ay

  const ab2 = abx * abx + aby * aby
  if (ab2 === 0) {
    // Degenerate segment (A === B)
    const distM = haversineM(pLat, pLon, A.lat, A.lon)
    return { km: cumMA / 1000, distM }
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))

  // Foot of perpendicular in degree-space
  const footLon = A.lon + t * (B.lon - A.lon)
  const footLat = A.lat + t * (B.lat - A.lat)

  const distM = haversineM(pLat, pLon, footLat, footLon)
  const km = (cumMA + t * (cumMB - cumMA)) / 1000

  return { km, distM }
}

/**
 * Full pre-processing pipeline: takes raw parsed GPX data and enriches it.
 *
 * 1. Builds cumulative distances along the track
 * 2. Snaps waypoints to the track and assigns routeKm
 *
 * Returns the data structure stored in IndexedDB.
 *
 * @param {Array<{lat,lon}>}              track
 * @param {Array<{lat,lon,name,sym,...}>}  waypoints
 * @returns {{ track, waypoints, cumM: number[], totalKm: number }}
 */
export function processRoute(track, waypoints) {
  if (track.length === 0) throw new Error('Tracé vide — aucun point de piste trouvé')

  const cumM = buildCumDistances(track)
  snapWaypointsToRoute(waypoints, track, cumM)

  const totalKm = cumM[cumM.length - 1] / 1000

  // Convert Float64Array to plain Array for JSON serialisation
  return { track, waypoints, cumM: Array.from(cumM), totalKm }
}

/**
 * Given a GPS fix, find the current position along the route (km from start)
 * and the distance in metres from the route.
 *
 * @param {number} lat  @param {number} lon
 * @param {Array<{lat,lon}>} track
 * @param {number[]} cumM
 * @returns {{ currentKm: number, snapDistM: number }}
 */
export function gpsToRouteKm(lat, lon, track, cumM) {
  const idx = nearestTrackIndex(lat, lon, track)
  const km = interpolateRouteKm(lat, lon, track, cumM, idx)

  // Snap distance: distance from GPS to nearest point on route (metres)
  // Use haversine to the nearest track point as a fast approximation
  const snapDistM = haversineM(lat, lon, track[idx].lat, track[idx].lon)

  return { currentKm: km, snapDistM }
}
