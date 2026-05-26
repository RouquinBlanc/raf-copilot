/**
 * settings.js — settings view logic: GPX loading, type toggles, manual km.
 */

import { parseGpx, gpxFingerprint } from './gpx.js'
import { processRoute } from './route.js'
import { saveRouteData, loadRouteVersion, clearRouteData, loadSettings, saveSettings } from './storage.js'

/**
 * Initialise the settings view.
 *
 * @param {Object} opts
 * @param {Function} opts.onRouteLoaded   — called with processed route data when GPX is ready
 * @param {Function} opts.onSettingsChange — called with updated settings object
 */
export function initSettings({ onRouteLoaded, onSettingsChange }) {

  // ── Restore saved toggle state ───────────────────────────────────────────
  const settings = loadSettings()
  document.querySelectorAll('.toggle-row input[data-type]').forEach((cb) => {
    const type = cb.dataset.type
    cb.checked = settings[type] !== false   // default true if not set
    cb.addEventListener('change', () => {
      settings[type] = cb.checked
      saveSettings(settings)
      onSettingsChange(settings)
    })
  })

  // ── Status helper ─────────────────────────────────────────────────────────
  const statusEl = document.getElementById('gpx-status')
  function setStatus(msg, isError = false) {
    statusEl.textContent = msg
    statusEl.className = 'gpx-status ' + (isError ? 'status-error' : 'status-ok')
  }

  // ── Shared GPX processing ─────────────────────────────────────────────────
  async function processAndStore(gpxText, label) {
    setStatus(`Chargement de ${label}…`)
    try {
      const fingerprint = gpxFingerprint(gpxText)

      // Check if we already have this exact version cached
      const cachedVersion = await loadRouteVersion()
      if (cachedVersion === fingerprint) {
        setStatus(`✓ Données déjà en cache (${label})`)
        return  // onRouteLoaded will be called from app.js on startup
      }

      const { track, waypoints, parseError } = parseGpx(gpxText)
      if (parseError) {
        setStatus(`Erreur GPX : ${parseError}`, true)
        return
      }
      if (track.length === 0) {
        setStatus('Erreur : aucun point de piste trouvé dans ce fichier.', true)
        return
      }

      setStatus(`Traitement… (${track.length} points, ${waypoints.length} POI)`)

      // processRoute is synchronous and fast (~15ms)
      const routeData = processRoute(track, waypoints)
      await saveRouteData(routeData, fingerprint)

      setStatus(
        `✓ ${label} — ${routeData.totalKm.toFixed(1)} km, ${waypoints.length} POI`
      )
      onRouteLoaded(routeData)

    } catch (err) {
      setStatus(`Erreur : ${err.message}`, true)
      console.error('[settings] processAndStore error:', err)
    }
  }

  // ── Option 1: local file picker ───────────────────────────────────────────
  const fileInput = document.getElementById('gpx-file-input')
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const text = await file.text()
    await processAndStore(text, file.name)
    fileInput.value = ''  // reset so same file can be re-selected
  })

  // ── Option 2: server URL ──────────────────────────────────────────────────
  const presetSelect = document.getElementById('gpx-preset-select')
  const loadUrlBtn   = document.getElementById('btn-load-url')

  loadUrlBtn.addEventListener('click', async () => {
    const url = presetSelect.value
    if (!url) {
      setStatus('Sélectionnez un fichier dans la liste.', true)
      return
    }
    setStatus(`Téléchargement depuis ${url}…`)
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      await processAndStore(text, url)
    } catch (err) {
      setStatus(`Téléchargement échoué : ${err.message}`, true)
    }
  })

  // ── Clear + reload ────────────────────────────────────────────────────────
  document.getElementById('btn-reload-data').addEventListener('click', async () => {
    if (!confirm('Effacer les données en cache et recharger ?')) return
    await clearRouteData()
    setStatus('Cache effacé. Chargez un nouveau fichier GPX.')
    onRouteLoaded(null)
  })

  // ── Manual km override ────────────────────────────────────────────────────
  const manualKmInput = document.getElementById('manual-km-input')
  document.getElementById('btn-apply-manual-km').addEventListener('click', () => {
    const km = parseFloat(manualKmInput.value)
    if (isNaN(km) || km < 0) {
      setStatus('Position invalide.', true)
      return
    }
    // Dispatch a custom event; app.js listens for it
    document.dispatchEvent(new CustomEvent('manualKm', { detail: { km } }))
  })

  return { settings }
}
