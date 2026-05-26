/**
 * route.js — geospatial maths for the RAF Copilot.
 *
 * No external libraries. Pure Haversine + dot-product projection.
 *
 * Coordinate convention throughout: { lat, lon, ele } in decimal degrees / metres.
 */

/** Bump this whenever the stored data structure changes to force re-processing. */
export const DATA_VERSION = '2'

const EARTH_RADIUS_M = 6_371_000  // metres

/** Degrees → radians */
const rad = (d) => (d * Math.PI) / 180

/**
 * Haversine great-circle distance in metres.
 * Accurate to ~0.1% for distances under 1000 km.
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
 * cumM[0] = 0, cumM[i] = cumM[i-1] + haversine(track[i-1], track[i])
 *
 * @param {Array<{lat,lon}>} track
 * @returns {Float64Array}
 */
export function buildCumDistances(track) {
  const cum = new Float64Array(track.length)
  for (let i = 1; i < track.length; i++) {
    cum[i] = cum[i - 1] + haversineM(
      track[i - 1].lat, track[i - 1].lon,
      track[i].lat,     track[i].lon
    )
  }
  return cum
}

/**
 * Build the cumulative positive-elevation-gain array (metres) for an ordered track.
 * Only upward steps are counted (D+ / dénivelé positif).
 *
 * cumD[0] = 0, cumD[i] = cumD[i-1] + max(0, track[i].ele - track[i-1].ele)
 *
 * @param {Array<{ele:number}>} track
 * @returns {Float64Array}
 */
export function buildCumElevGain(track) {
  const cumD = new Float64Array(track.length)
  for (let i = 1; i < track.length; i++) {
    const gain = track[i].ele - track[i - 1].ele
    cumD[i] = cumD[i - 1] + (gain > 0 ? gain : 0)
  }
  return cumD
}

/**
 * Snap each waypoint to the nearest track point and assign:
 *   - wpt.routeKm   — cumulative km from start at snap point
 *   - wpt.snapIdx   — index of nearest track point (for cumD lookup)
 *   - wpt.routeCumD — cumulative D+ from start at snap point (metres)
 *
 * @param {Array<{lat,lon,routeKm,snapIdx,routeCumD}>} waypoints  mutated in-place
 * @param {Array<{lat,lon,ele}>}                        track
 * @param {Float64Array}                                cumM
 * @param {Float64Array}                                cumD
 */
export function snapWaypointsToRoute(waypoints, track, cumM, cumD) {
  for (const wpt of waypoints) {
    const idx = nearestTrackIndex(wpt.lat, wpt.lon, track)
    const km  = interpolateRouteKm(wpt.lat, wpt.lon, track, cumM, idx)
    wpt.routeKm   = km
    wpt.snapIdx   = idx
    wpt.routeCumD = cumD[idx]
  }
  waypoints.sort((a, b) => a.routeKm - b.routeKm)
}

/**
 * O(n) nearest-track-point scan.
 * Uses cosine-corrected squared Euclidean distance (avoids sqrt for the min search).
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
 * Given the index of the nearest track point, project GPS onto the two
 * adjacent segments and return the interpolated cumulative km.
 */
function interpolateRouteKm(lat, lon, track, cumM, nearestIdx) {
  let bestKm     = cumM[nearestIdx] / 1000
  let bestDistM  = haversineM(lat, lon, track[nearestIdx].lat, track[nearestIdx].lon)

  const candidates = [nearestIdx - 1, nearestIdx].filter(
    (i) => i >= 0 && i + 1 < track.length
  )
  for (const i of candidates) {
    const result = projectOntoSegment(lat, lon, track[i], track[i + 1], cumM[i], cumM[i + 1])
    if (result.distM < bestDistM) {
      bestDistM = result.distM
      bestKm    = result.km
    }
  }
  return bestKm
}

/**
 * Project point P onto segment A→B (geographic coords).
 * Returns interpolated cumulative km + perpendicular distance.
 */
function projectOntoSegment(pLat, pLon, A, B, cumMA, cumMB) {
  const cosLat = Math.cos(rad((A.lat + B.lat) / 2))

  const ax = A.lon * cosLat, ay = A.lat
  const bx = B.lon * cosLat, by = B.lat
  const px = pLon * cosLat, py = pLat

  const abx = bx - ax, aby = by - ay
  const apx = px - ax, apy = py - ay
  const ab2 = abx * abx + aby * aby

  if (ab2 === 0) {
    return { km: cumMA / 1000, distM: haversineM(pLat, pLon, A.lat, A.lon) }
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
  const footLon = A.lon + t * (B.lon - A.lon)
  const footLat = A.lat + t * (B.lat - A.lat)

  return {
    km:    (cumMA + t * (cumMB - cumMA)) / 1000,
    distM: haversineM(pLat, pLon, footLat, footLon),
  }
}

/**
 * Full pre-processing pipeline.
 * 1. Cumulative distances (cumM)
 * 2. Cumulative D+ (cumD)
 * 3. Snap waypoints → assign routeKm, snapIdx, routeCumD
 *
 * @param {Array<{lat,lon,ele}>}             track
 * @param {Array<{lat,lon,name,sym,...}>}     waypoints
 * @returns {{ version, track, waypoints, cumM, cumD, totalKm, totalD }}
 */
export function processRoute(track, waypoints) {
  if (track.length === 0) throw new Error('Tracé vide — aucun point de piste trouvé')

  const cumM = buildCumDistances(track)
  const cumD = buildCumElevGain(track)
  snapWaypointsToRoute(waypoints, track, cumM, cumD)

  const totalKm = cumM[cumM.length - 1] / 1000
  const totalD  = Math.round(cumD[cumD.length - 1])   // total D+ in metres

  return {
    version: DATA_VERSION,
    track,
    waypoints,
    cumM: Array.from(cumM),
    cumD: Array.from(cumD),
    totalKm,
    totalD,
  }
}

/**
 * Given a GPS fix, return:
 *   - currentKm    — position along the route in km
 *   - currentCumD  — cumulative D+ in metres from start to current position
 *   - snapDistM    — distance from GPS to nearest point on route (metres)
 *
 * @param {number} lat  @param {number} lon
 * @param {Array<{lat,lon}>} track
 * @param {number[]} cumM
 * @param {number[]} cumD
 * @returns {{ currentKm: number, currentCumD: number, snapDistM: number }}
 */
export function gpsToRouteKm(lat, lon, track, cumM, cumD) {
  const idx     = nearestTrackIndex(lat, lon, track)
  const km      = interpolateRouteKm(lat, lon, track, cumM, idx)
  const snapDistM = haversineM(lat, lon, track[idx].lat, track[idx].lon)
  const currentCumD = cumD[idx]

  return { currentKm: km, currentCumD, snapDistM }
}
