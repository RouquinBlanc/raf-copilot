/**
 * timeline.js — render the upcoming POI list with expand/collapse detail rows.
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

/**
 * Format a distance in km for display.
 * < 1 km → "350 m", ≥ 1 km → "1.2 km"
 */
function formatDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/**
 * Build a clean human-readable description from the raw GPX desc field.
 * GPX desc looks like "amenity: drinking_water" or "shop: convenience".
 * Returns null if nothing useful.
 */
function formatDesc(desc) {
  if (!desc) return null
  // Strip "amenity: " / "shop: " prefixes and underscores → readable text
  return desc
    .replace(/^(amenity|shop|tourism|leisure|highway):\s*/i, '')
    .replace(/_/g, ' ')
    .trim() || null
}

/**
 * Build a Google Maps URL for a lat/lon point.
 * Opens a pin at the exact waypoint coordinates.
 */
function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

/**
 * Render the timeline list.
 *
 * @param {Array<{name, sym, desc, lat, lon, ele, routeKm, distanceKm}>} upcomingPOIs
 *        Already filtered and sorted, with distanceKm set.
 * @param {HTMLOListElement} listEl
 */
export function renderTimeline(upcomingPOIs, listEl) {
  const items = upcomingPOIs.slice(0, MAX_ITEMS)

  if (items.length === 0) {
    listEl.innerHTML = `<li class="poi-empty">Aucun point d'intérêt à venir 🎉</li>`
    return
  }

  // Remember which index was open before re-render so we can restore it
  const previouslyOpen = listEl.querySelector('.poi-item.open')?.dataset.idx

  listEl.innerHTML = items
    .map((poi, idx) => {
      const meta    = SYM_META[poi.sym] ?? SYM_META['Other']
      const desc    = formatDesc(poi.desc)
      const mapsUrl = googleMapsUrl(poi.lat, poi.lon)
      const eleStr  = poi.ele ? `${Math.round(poi.ele)} m` : null
      const wasOpen = String(idx) === previouslyOpen

      return `
        <li class="poi-item ${meta.cls}${wasOpen ? ' open' : ''}" data-idx="${idx}" role="button" tabindex="0">

          <!-- ── Summary row (always visible) ── -->
          <div class="poi-row">
            <span class="poi-icon">${meta.emoji}</span>
            <span class="poi-name">${escapeHtml(poi.name)}</span>
            <span class="poi-dist">+${formatDist(poi.distanceKm)}</span>
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

  // ── Toggle expand on tap/click ────────────────────────────────────────────
  listEl.addEventListener('click', handleToggle)
  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleToggle(e)
  })
}

function handleToggle(e) {
  // Don't collapse when tapping the Maps link itself
  if (e.target.closest('.maps-btn')) return

  const item = e.target.closest('.poi-item')
  if (!item) return

  const isOpen = item.classList.contains('open')

  // Close any currently open item
  item.closest('.poi-list')
    ?.querySelectorAll('.poi-item.open')
    .forEach((el) => el.classList.remove('open'))

  // Toggle the clicked one (unless it was already open → just collapsed above)
  if (!isOpen) item.classList.add('open')
}

/**
 * Update the "km actuel" status display.
 */
export function renderCurrentKm(km, el) {
  if (km === null) {
    el.textContent = '—'
    el.classList.add('unknown')
  } else {
    el.textContent = `km ${km.toFixed(1)}`
    el.classList.remove('unknown')
  }
}

/** Minimal HTML escape to prevent XSS from GPX content */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
