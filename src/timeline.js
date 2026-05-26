/**
 * timeline.js — render the upcoming POI list with expand/collapse detail rows,
 *               the "prochain par type" dashboard, and the status bar.
 */

/** Max POIs to show in the timeline */
const MAX_ITEMS = 12

/** Symbol → { emoji, CSS class } */
const SYM_META = {
  'Drinking Water':    { emoji: '💧', cls: 'type-water'      },
  'Convenience Store': { emoji: '🛒', cls: 'type-store'      },
  'Restroom':          { emoji: '🚽', cls: 'type-restroom'   },
  'Restaurant':        { emoji: '🍽️', cls: 'type-restaurant' },
  'Flag, Blue':        { emoji: '🏁', cls: 'type-checkpoint' },
  'Other':             { emoji: '🔧', cls: 'type-other'      },
}

/** Order in which types appear in the "prochain par type" dashboard */
const DASHBOARD_ORDER = [
  'Drinking Water',
  'Restroom',
  'Convenience Store',
  'Restaurant',
  'Flag, Blue',
  'Other',
]

/**
 * Format a distance in km for display.
 * < 1 km → "350 m", ≥ 1 km → "1.2 km"
 */
function formatDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/**
 * Format a D+ value in metres.
 * Returns null when 0 (nothing to display).
 */
function formatDPlus(m) {
  if (!m || m <= 0) return null
  if (m >= 1000) return `↗ ${(m / 1000).toFixed(1)} km D+`
  return `↗ ${m} m D+`
}

/**
 * CSS class for the D+ badge depending on climbing intensity.
 * < 100m  → low  (muted)
 * 100-400m → medium (white)
 * > 400m  → high (amber warning)
 */
function dPlusClass(m) {
  if (m < 100) return 'dplus-low'
  if (m < 400) return 'dplus-medium'
  return 'dplus-high'
}

/**
 * Build a clean human-readable description from the raw GPX desc field.
 */
function formatDesc(desc) {
  if (!desc) return null
  return desc
    .replace(/^(amenity|shop|tourism|leisure|highway):\s*/i, '')
    .replace(/_/g, ' ')
    .trim() || null
}

/** Google Maps pin URL */
function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

// ── Main timeline renderer ────────────────────────────────────────────────────

/**
 * Render the POI list with expandable detail rows.
 *
 * @param {Array<{name, sym, desc, lat, lon, ele, routeKm, distanceKm, dPlus}>} upcomingPOIs
 * @param {HTMLOListElement} listEl
 */
export function renderTimeline(upcomingPOIs, listEl) {
  const items = upcomingPOIs.slice(0, MAX_ITEMS)

  if (items.length === 0) {
    listEl.innerHTML = `<li class="poi-empty">Aucun point d'intérêt à venir 🎉</li>`
    return
  }

  const previouslyOpen = listEl.querySelector('.poi-item.open')?.dataset.idx

  listEl.innerHTML = items
    .map((poi, idx) => {
      const meta     = SYM_META[poi.sym] ?? SYM_META['Other']
      const desc     = formatDesc(poi.desc)
      const mapsUrl  = googleMapsUrl(poi.lat, poi.lon)
      const eleStr   = poi.ele ? `${Math.round(poi.ele)} m` : null
      const dPlus    = formatDPlus(poi.dPlus)
      const wasOpen  = String(idx) === previouslyOpen

      return `
        <li class="poi-item ${meta.cls}${wasOpen ? ' open' : ''}" data-idx="${idx}" role="button" tabindex="0">

          <!-- ── Summary row (always visible) ── -->
          <div class="poi-row">
            <span class="poi-icon">${meta.emoji}</span>
            <span class="poi-name">${escapeHtml(poi.name)}</span>
            <span class="poi-dist">+${formatDist(poi.distanceKm)}</span>
            ${dPlus ? `<span class="poi-dplus ${dPlusClass(poi.dPlus)}">${dPlus}</span>` : ''}
            <span class="poi-chevron" aria-hidden="true">›</span>
          </div>

          <!-- ── Detail panel (visible when .open) ── -->
          <div class="poi-detail">
            <div class="poi-detail-inner">

              <dl class="poi-meta">
                <div class="meta-row">
                  <dt>📍 Position</dt>
                  <dd>km ${poi.routeKm.toFixed(1)} sur le tracé</dd>
                </div>
                ${eleStr ? `
                <div class="meta-row">
                  <dt>⛰️ Altitude</dt>
                  <dd>${eleStr}</dd>
                </div>` : ''}
                ${poi.dPlus > 0 ? `
                <div class="meta-row">
                  <dt>📈 D+ à parcourir</dt>
                  <dd>${poi.dPlus} m</dd>
                </div>` : ''}
                ${desc ? `
                <div class="meta-row">
                  <dt>ℹ️ Type</dt>
                  <dd>${escapeHtml(desc)}</dd>
                </div>` : ''}
                <div class="meta-row">
                  <dt>🌐 Coords</dt>
                  <dd>${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}</dd>
                </div>
              </dl>

              <a class="maps-btn" href="${mapsUrl}" target="_blank" rel="noopener">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/>
                </svg>
                Ouvrir dans Google Maps
              </a>

            </div>
          </div>

        </li>`
    })
    .join('')

  // Toggle expand on tap/click (attach once per render)
  listEl.addEventListener('click', handleToggle)
  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleToggle(e)
  })
}

function handleToggle(e) {
  if (e.target.closest('.maps-btn')) return
  const item = e.target.closest('.poi-item')
  if (!item) return
  const isOpen = item.classList.contains('open')
  item.closest('.poi-list')
    ?.querySelectorAll('.poi-item.open')
    .forEach((el) => el.classList.remove('open'))
  if (!isOpen) item.classList.add('open')
}

// ── Dashboard: prochain par type ──────────────────────────────────────────────

/**
 * Render the "next of each type" chip bar.
 *
 * Shows: 💧 1.2km · 🚽 4.1km · 🛒 3.8km
 * Only categories that are enabled in settings AND have upcoming POIs are shown.
 *
 * @param {Array<{sym, distanceKm}>} upcomingPOIs  — already filtered & sorted
 * @param {Object}                   settings       — { 'Drinking Water': true, … }
 * @param {HTMLElement}              el             — #next-by-type
 */
export function renderNextByType(upcomingPOIs, settings, el) {
  const chips = DASHBOARD_ORDER
    .filter((sym) => settings[sym] !== false)
    .map((sym) => {
      const next = upcomingPOIs.find((w) => w.sym === sym)
      if (!next) return null
      const { emoji } = SYM_META[sym] ?? SYM_META['Other']
      return `<span class="nbt-chip">${emoji}&nbsp;${formatDist(next.distanceKm)}</span>`
    })
    .filter(Boolean)

  if (chips.length === 0) {
    el.classList.add('hidden')
    return
  }
  el.innerHTML = chips.join('')
  el.classList.remove('hidden')
}

// ── Status bar ────────────────────────────────────────────────────────────────

/**
 * Update the status bar: current km + remaining km.
 *
 * @param {number|null} km        — current position on route
 * @param {number|null} totalKm   — total route length
 * @param {HTMLElement} kmEl      — #current-km
 * @param {HTMLElement} remainingEl — #remaining-km
 */
export function renderCurrentKm(km, totalKm, kmEl, remainingEl) {
  if (km === null) {
    kmEl.textContent = '—'
    kmEl.classList.add('unknown')
    remainingEl.classList.add('hidden')
  } else {
    kmEl.textContent = `km ${km.toFixed(1)}`
    kmEl.classList.remove('unknown')
    if (totalKm) {
      const remaining = Math.max(0, totalKm - km)
      remainingEl.textContent = `reste ${remaining.toFixed(0)} km`
      remainingEl.classList.remove('hidden')
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Minimal HTML escape to prevent XSS from GPX content */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
