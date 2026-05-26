/**
 * timeline.js — render the upcoming POI list.
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
 *
 * @param {number} km
 * @returns {string}
 */
function formatDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/**
 * Render the timeline list.
 *
 * @param {Array<{name, sym, routeKm, distanceKm}>} upcomingPOIs
 *        Already filtered and sorted, with distanceKm set.
 * @param {HTMLOListElement} listEl
 */
export function renderTimeline(upcomingPOIs, listEl) {
  const items = upcomingPOIs.slice(0, MAX_ITEMS)

  if (items.length === 0) {
    listEl.innerHTML = `<li class="poi-empty">Aucun point d'intérêt à venir 🎉</li>`
    return
  }

  listEl.innerHTML = items
    .map((poi) => {
      const meta = SYM_META[poi.sym] ?? SYM_META['Other']
      return `
        <li class="poi-row ${meta.cls}">
          <span class="poi-icon">${meta.emoji}</span>
          <span class="poi-name">${escapeHtml(poi.name)}</span>
          <span class="poi-dist">+${formatDist(poi.distanceKm)}</span>
        </li>`
    })
    .join('')
}

/**
 * Update the "km actuel" status display.
 *
 * @param {number|null} km   null = unknown
 * @param {HTMLElement}  el
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
