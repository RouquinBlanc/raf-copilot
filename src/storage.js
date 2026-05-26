/**
 * storage.js — persistence layer for RAF Copilot.
 *
 * Route data (large, ~450 KB serialised): IndexedDB via idb-keyval
 * Settings (tiny key-value):              localStorage
 */

import { get, set, del } from 'idb-keyval'

// ── IndexedDB keys ────────────────────────────────────────────────────────────

const KEY_ROUTE_DATA    = 'routeData'       // processed track + waypoints
const KEY_ROUTE_VERSION = 'routeVersion'    // fingerprint of the source GPX

// ── Route data ────────────────────────────────────────────────────────────────

/**
 * Load the processed route data from IndexedDB.
 * Returns null if nothing is cached.
 *
 * @returns {Promise<{track, waypoints, cumM, totalKm}|null>}
 */
export async function loadRouteData() {
  return (await get(KEY_ROUTE_DATA)) ?? null
}

/**
 * Persist the processed route data + the GPX fingerprint.
 *
 * @param {{track, waypoints, cumM, totalKm}} data
 * @param {string} fingerprint  — from gpxFingerprint()
 */
export async function saveRouteData(data, fingerprint) {
  await set(KEY_ROUTE_VERSION, fingerprint)
  await set(KEY_ROUTE_DATA, data)
}

/**
 * Return the stored GPX fingerprint, or null if none.
 * @returns {Promise<string|null>}
 */
export async function loadRouteVersion() {
  return (await get(KEY_ROUTE_VERSION)) ?? null
}

/**
 * Clear all cached route data (forces reprocessing on next GPX load).
 */
export async function clearRouteData() {
  await del(KEY_ROUTE_DATA)
  await del(KEY_ROUTE_VERSION)
}

// ── Settings (localStorage) ───────────────────────────────────────────────────

const SETTINGS_KEY = 'rafSettings'

/** Default settings */
const DEFAULTS = {
  // POI type visibility — keyed by GPX <sym> value
  'Drinking Water':  true,
  'Convenience Store': true,
  'Restroom':        true,
  'Restaurant':      true,
  'Flag, Blue':      true,
  'Other':           true,
}

/**
 * Load settings from localStorage (falls back to defaults).
 * @returns {Object}
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Persist settings to localStorage.
 * @param {Object} settings
 */
export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// ── Last known km (localStorage) ─────────────────────────────────────────────

const LAST_KM_KEY = 'lastKm'

/** Save the last known position on the route. */
export function saveLastKm(km) {
  localStorage.setItem(LAST_KM_KEY, String(km))
}

/** Load the last known position, or null. */
export function loadLastKm() {
  const v = localStorage.getItem(LAST_KM_KEY)
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}
