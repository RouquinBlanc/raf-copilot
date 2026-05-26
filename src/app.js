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
import { renderTimeline, renderCurrentKm, renderNextByType } from './timeline.js'
import { initSettings } from './settings.js'

// ── State ─────────────────────────────────────────────────────────────────────

let routeData   = null   // { version, track, waypoints, cumM, cumD, totalKm, totalD }
let settings    = {}
let currentKm   = null
let currentCumD = null   // cumulative D+ in metres at current position
let wakeLock    = null

// ── DOM refs ──────────────────────────────────────────────────────────────────

const viewTimeline   = document.getElementById('view-timeline')
const viewSettings   = document.getElementById('view-settings')
const btnSettings    = document.getElementById('btn-settings')
const btnLocate      = document.getElementById('btn-locate')
const poiList        = document.getElementById('poi-list')
const currentKmEl    = document.getElementById('current-km')
const remainingKmEl  = document.getElementById('remaining-km')
const nextByTypeEl   = document.getElementById('next-by-type')
const offrouteBanner = document.getElementById('offroute-banner')
const noDataBanner   = document.getElementById('no-data-banner')

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
  renderCurrentKm(currentKm, routeData?.totalKm ?? null, currentKmEl, remainingKmEl)

  const hasData = routeData && routeData.waypoints?.length > 0
  noDataBanner.classList.toggle('hidden', hasData)

  if (!hasData || currentKm === null) {
    poiList.innerHTML = ''
    nextByTypeEl.classList.add('hidden')
    return
  }

  // Build upcoming POI list — enrich with distanceKm and dPlus.
  // dPlus is null when we don't have a GPS fix yet (currentCumD unknown) —
  // never fall back to 0, which would wrongly show D+ from km 0.
  const upcoming = routeData.waypoints
    .filter((w) => w.routeKm > currentKm && settings[w.sym] !== false)
    .map((w) => ({
      ...w,
      distanceKm: w.routeKm - currentKm,
      dPlus: currentCumD !== null && w.routeCumD != null
        ? Math.max(0, Math.round(w.routeCumD - currentCumD))
        : null,
    }))

  renderTimeline(upcoming, poiList)
  renderNextByType(upcoming, settings, nextByTypeEl)
}

// ── GPS ───────────────────────────────────────────────────────────────────────

const OFF_ROUTE_THRESHOLD_M = 500

function handlePosition(pos) {
  const { latitude, longitude } = pos.coords

  if (!routeData) {
    currentKm = null
    currentCumD = null
    renderCurrentKm(null, null, currentKmEl, remainingKmEl)
    return
  }

  const result = gpsToRouteKm(
    latitude, longitude,
    routeData.track,
    routeData.cumM,
    routeData.cumD,
  )

  currentKm   = result.currentKm
  currentCumD = result.currentCumD
  saveLastKm(currentKm)
  offrouteBanner.classList.toggle('hidden', result.snapDistM <= OFF_ROUTE_THRESHOLD_M)
  renderCurrent()
}

function handlePositionError(err) {
  let msg
  switch (err.code) {
    case err.PERMISSION_DENIED:
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
  setTimeout(() => offrouteBanner.classList.add('hidden'), 8000)
}

btnLocate.addEventListener('click', async () => {
  if (!navigator.geolocation) {
    showGpsError('La géolocalisation n\'est pas disponible dans ce navigateur.')
    return
  }
  if (location.protocol === 'http:' && location.hostname !== 'localhost') {
    showGpsError('⛔ GPS bloqué — ouvrez le site en HTTPS (ou déployez sur GitHub Pages).')
    return
  }

  btnLocate.disabled = true
  btnLocate.textContent = '⏳ Localisation…'
  await requestWakeLock()

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      handlePosition(pos)
      btnLocate.disabled = false
      btnLocate.textContent = '📍 Localiser'
    },
    (err) => handlePositionError(err),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
  )
})

// ── Screen Wake Lock ──────────────────────────────────────────────────────────

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return
  try {
    if (wakeLock && !wakeLock.released) return
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => { wakeLock = null })
  } catch { /* non-fatal */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock()
})

// ── Manual km override ────────────────────────────────────────────────────────

document.addEventListener('manualKm', (e) => {
  currentKm = e.detail.km
  // Approximate currentCumD by interpolating cumD at the nearest km position
  if (routeData?.cumM && routeData?.cumD) {
    const targetM = currentKm * 1000
    const idx = routeData.cumM.findIndex((m) => m >= targetM)
    currentCumD = idx >= 0 ? routeData.cumD[idx] : routeData.cumD[routeData.cumD.length - 1]
  }
  saveLastKm(currentKm)
  offrouteBanner.classList.add('hidden')
  showView('timeline')
  renderCurrent()
})

// ── Settings callbacks ────────────────────────────────────────────────────────

function onRouteLoaded(data) {
  routeData = data
  currentCumD = null   // will be recomputed on next GPS fix or manual km
  renderCurrent()
  if (data) showView('timeline')
}

function onSettingsChange(newSettings) {
  settings = newSettings
  renderCurrent()
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  const { settings: s } = initSettings({ onRouteLoaded, onSettingsChange })
  settings = s

  routeData = await loadRouteData()
  currentKm = loadLastKm()

  // If we have a saved km, approximate the cumD from the cumD array
  if (currentKm !== null && routeData?.cumM && routeData?.cumD) {
    const targetM = currentKm * 1000
    const idx = routeData.cumM.findIndex((m) => m >= targetM)
    currentCumD = idx >= 0 ? routeData.cumD[idx] : null
  }

  renderCurrent()

  if (!routeData) {
    noDataBanner.classList.remove('hidden')
  }
}

boot()
