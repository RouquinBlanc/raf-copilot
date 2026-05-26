/**
 * app.js — RAF Copilot entry point.
 *
 * Responsibilities:
 *  - View switching (timeline ↔ settings)
 *  - GPS "Localiser" button
 *  - Screen Wake Lock
 *  - Orchestrating gpx / route / storage / timeline / settings modules
 */

import { loadRouteData, loadSettings, saveLastKm, loadLastKm } from './storage.js'
import { gpsToRouteKm } from './route.js'
import { renderTimeline, renderCurrentKm } from './timeline.js'
import { initSettings } from './settings.js'

// ── State ─────────────────────────────────────────────────────────────────────

let routeData  = null   // { track, waypoints, cumM, totalKm }
let settings   = {}
let currentKm  = null
let wakeLock   = null

// ── DOM refs ──────────────────────────────────────────────────────────────────

const viewTimeline  = document.getElementById('view-timeline')
const viewSettings  = document.getElementById('view-settings')
const btnSettings   = document.getElementById('btn-settings')
const btnLocate     = document.getElementById('btn-locate')
const poiList       = document.getElementById('poi-list')
const currentKmEl   = document.getElementById('current-km')
const offrouteBanner = document.getElementById('offroute-banner')
const noDataBanner  = document.getElementById('no-data-banner')

// ── View switching ────────────────────────────────────────────────────────────

let activeView = 'timeline'

function showView(name) {
  activeView = name
  viewTimeline.classList.toggle('active', name === 'timeline')
  viewSettings.classList.toggle('active', name === 'settings')

  // Settings button: ⚙️ when showing timeline, ← when showing settings
  btnSettings.textContent = name === 'timeline' ? '⚙️' : '←'
  btnSettings.setAttribute('aria-label', name === 'timeline' ? 'Paramètres' : 'Retour')
}

btnSettings.addEventListener('click', () => {
  showView(activeView === 'timeline' ? 'settings' : 'timeline')
})

// ── Timeline render ───────────────────────────────────────────────────────────

function renderCurrent() {
  renderCurrentKm(currentKm, currentKmEl)

  const hasData = routeData && routeData.waypoints?.length > 0
  noDataBanner.classList.toggle('hidden', hasData)

  if (!hasData || currentKm === null) {
    poiList.innerHTML = ''
    return
  }

  // Filter upcoming POIs by position and enabled types
  const upcoming = routeData.waypoints
    .filter((w) => w.routeKm > currentKm && settings[w.sym] !== false)
    .map((w) => ({ ...w, distanceKm: w.routeKm - currentKm }))

  renderTimeline(upcoming, poiList)
}

// ── GPS ───────────────────────────────────────────────────────────────────────

const OFF_ROUTE_THRESHOLD_M = 500

function handlePosition(pos) {
  const { latitude, longitude } = pos.coords

  if (!routeData) {
    // We have a GPS fix but no route — just show coordinates
    currentKm = null
    renderCurrentKm(null, currentKmEl)
    return
  }

  const { currentKm: km, snapDistM } = gpsToRouteKm(
    latitude, longitude,
    routeData.track,
    routeData.cumM
  )

  currentKm = km
  saveLastKm(km)
  offrouteBanner.classList.toggle('hidden', snapDistM <= OFF_ROUTE_THRESHOLD_M)
  renderCurrent()
}

function handlePositionError(err) {
  let msg
  switch (err.code) {
    case err.PERMISSION_DENIED:
      // PERMISSION_DENIED on HTTP (non-localhost) means Chrome blocked it silently
      // because geolocation requires a secure context (HTTPS).
      msg = '⛔ GPS refusé — le site doit être ouvert en HTTPS pour accéder à la position.'
      break
    case err.POSITION_UNAVAILABLE:
      msg = '📡 Position GPS indisponible — réessayez en extérieur.'
      break
    case err.TIMEOUT:
      msg = '⏱️ Délai GPS dépassé — réessayez.'
      break
    default:
      msg = `Erreur GPS : ${err.message}`
  }
  showGpsError(msg)
  btnLocate.disabled = false
  btnLocate.textContent = '📍 Localiser'
}

function showGpsError(msg) {
  offrouteBanner.textContent = msg
  offrouteBanner.classList.remove('hidden')
  // Auto-hide after 8 seconds
  setTimeout(() => offrouteBanner.classList.add('hidden'), 8000)
}

btnLocate.addEventListener('click', async () => {
  if (!navigator.geolocation) {
    showGpsError('La géolocalisation n\'est pas disponible dans ce navigateur.')
    return
  }
  // Warn early if we're on plain HTTP (not localhost) — geolocation will be denied
  if (location.protocol === 'http:' && location.hostname !== 'localhost') {
    showGpsError('⛔ GPS bloqué — ouvrez le site en HTTPS (ou déployez sur GitHub Pages).')
    return
  }

  btnLocate.disabled = true
  btnLocate.textContent = '⏳ Localisation…'

  // Acquire/re-acquire screen wake lock so display stays on
  await requestWakeLock()

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      handlePosition(pos)
      btnLocate.disabled = false
      btnLocate.textContent = '📍 Localiser'
    },
    (err) => handlePositionError(err),
    {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 30_000,   // accept a cached fix up to 30s old
    }
  )
})

// ── Screen Wake Lock ──────────────────────────────────────────────────────────

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return
  try {
    if (wakeLock && !wakeLock.released) return  // already held
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => {
      wakeLock = null
    })
  } catch {
    // Wake lock not granted — non-fatal, app works without it
  }
}

// Re-acquire wake lock if page becomes visible again (e.g. after screen timeout)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock()
})

// ── Manual km override ────────────────────────────────────────────────────────

document.addEventListener('manualKm', (e) => {
  currentKm = e.detail.km
  saveLastKm(currentKm)
  offrouteBanner.classList.add('hidden')
  showView('timeline')
  renderCurrent()
})

// ── Settings callbacks ────────────────────────────────────────────────────────

function onRouteLoaded(data) {
  routeData = data
  renderCurrent()
  // Switch to timeline so user sees results immediately
  if (data) showView('timeline')
}

function onSettingsChange(newSettings) {
  settings = newSettings
  renderCurrent()
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  // Init settings (restores toggles, wires GPX load buttons)
  const { settings: s } = initSettings({ onRouteLoaded, onSettingsChange })
  settings = s

  // Load cached route data (if any)
  routeData = await loadRouteData()

  // Restore last known km
  currentKm = loadLastKm()

  // Initial render
  renderCurrent()

  // Show no-data nudge if no GPX is loaded yet
  if (!routeData) {
    noDataBanner.classList.remove('hidden')
  }
}

boot()
