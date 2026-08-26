/**
 * How big the document text is.
 *
 * The chrome does not move. Tabs, the status bar and the palette are drawn at
 * native metrics on purpose, and an app whose caption buttons grow when you
 * zoom in stops looking like it belongs to the operating system. What changes
 * is the thing you are actually reading: the reader surface, the source view,
 * the preview pane and the popovers.
 *
 * The level is a multiplier on `--zoom`, which every document size is written
 * against. Like the theme it is a preference rather than data, so it lives in
 * localStorage and nothing breaks if it goes missing.
 */

/**
 * The ladder, rather than a step of a fixed percentage.
 *
 * Steps get coarser as they get bigger, because the difference between 13.5px
 * and 15px matters and the difference between 24px and 25px does not. Browsers
 * have worked this way for twenty years and the muscle memory is worth having.
 */
export const ZOOM_LEVELS: readonly number[] = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

export const DEFAULT_ZOOM = 1

const STORAGE_KEY = 'markpad.zoom'

let current: number = load()

function load(): number {
  try {
    return nearestLevel(Number(localStorage.getItem(STORAGE_KEY)))
  } catch {
    // Private mode, a locked-down profile, or a WebView with storage disabled.
    return DEFAULT_ZOOM
  }
}

/**
 * The closest rung to a number that may be anything at all.
 *
 * Covers a missing value, a corrupted one, and a level written by a future
 * version whose ladder has rungs this one does not, all without a special case
 * for each.
 */
function nearestLevel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_ZOOM

  let closest = ZOOM_LEVELS[0]!
  for (const level of ZOOM_LEVELS) {
    if (Math.abs(level - value) < Math.abs(closest - value)) closest = level
  }
  return closest
}

export function currentZoom(): number {
  return current
}

export function canZoomIn(): boolean {
  return current < ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
}

export function canZoomOut(): boolean {
  return current > ZOOM_LEVELS[0]!
}

export function zoomIn(): void {
  setZoom(step(1))
}

export function zoomOut(): void {
  setZoom(step(-1))
}

export function resetZoom(): void {
  setZoom(DEFAULT_ZOOM)
}

function step(direction: 1 | -1): number {
  const index = ZOOM_LEVELS.indexOf(nearestLevel(current))
  const next = ZOOM_LEVELS[index + direction]
  // At either end, stay where you are rather than wrapping round. Zooming in
  // past the top should do nothing, not throw you back to the smallest size.
  return next ?? current
}

export function setZoom(level: number): void {
  current = nearestLevel(level)

  try {
    if (current === DEFAULT_ZOOM) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(current))
  } catch {
    // Same as above: it just will not be remembered next time.
  }

  applyZoom()
}

/** Put the level where the stylesheets read it. Call once at startup. */
export function applyZoom(): void {
  document.documentElement.style.setProperty('--zoom', String(current))
}

/** "125%", for anywhere the level has to be shown to a person. */
export function zoomLabel(level: number = current): string {
  return `${Math.round(level * 100)}%`
}
