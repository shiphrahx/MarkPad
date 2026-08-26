// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The module keeps the level in a variable, so each test needs a fresh one. */
async function freshModule() {
  vi.resetModules()
  return import('../../src/ui/zoom.js')
}

function cssZoom(): string {
  return document.documentElement.style.getPropertyValue('--zoom')
}

describe('zoom', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--zoom')
  })

  it('starts at actual size', async () => {
    const zoom = await freshModule()
    expect(zoom.currentZoom()).toBe(1)
  })

  it('writes the level where the stylesheets read it', async () => {
    const zoom = await freshModule()
    zoom.zoomIn()
    expect(cssZoom()).toBe('1.1')
  })

  it('steps up and back down the ladder', async () => {
    const zoom = await freshModule()

    zoom.zoomIn()
    zoom.zoomIn()
    expect(zoom.currentZoom()).toBe(1.25)

    zoom.zoomOut()
    expect(zoom.currentZoom()).toBe(1.1)
  })

  it('stays put at either end rather than wrapping round', async () => {
    const zoom = await freshModule()

    for (let i = 0; i < 20; i++) zoom.zoomIn()
    expect(zoom.currentZoom()).toBe(2)
    expect(zoom.canZoomIn()).toBe(false)

    for (let i = 0; i < 20; i++) zoom.zoomOut()
    expect(zoom.currentZoom()).toBe(0.75)
    expect(zoom.canZoomOut()).toBe(false)
  })

  it('goes back to actual size', async () => {
    const zoom = await freshModule()

    zoom.zoomIn()
    zoom.resetZoom()

    expect(zoom.currentZoom()).toBe(1)
    expect(cssZoom()).toBe('1')
  })

  it('remembers the level, and forgets it again at actual size', async () => {
    const first = await freshModule()
    first.zoomIn()

    const second = await freshModule()
    expect(second.currentZoom()).toBe(1.1)

    second.resetZoom()
    expect(localStorage.getItem('markpad.zoom')).toBe(null)

    const third = await freshModule()
    expect(third.currentZoom()).toBe(1)
  })

  it('rounds a stored level that is not on the ladder to the nearest rung', async () => {
    localStorage.setItem('markpad.zoom', '1.2')
    const zoom = await freshModule()
    expect(zoom.currentZoom()).toBe(1.25)
  })

  it('falls back to actual size when the stored level is nonsense', async () => {
    for (const stored of ['', 'huge', '0', '-2', 'NaN']) {
      localStorage.setItem('markpad.zoom', stored)
      const zoom = await freshModule()
      expect(zoom.currentZoom()).toBe(1)
    }
  })

  it('writes the level as a percentage', async () => {
    const zoom = await freshModule()
    expect(zoom.zoomLabel(1)).toBe('100%')
    expect(zoom.zoomLabel(1.25)).toBe('125%')
    expect(zoom.zoomLabel(0.75)).toBe('75%')
  })
})
