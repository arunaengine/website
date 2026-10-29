import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as NodePlaces from '@/lib/nodePlaces'
import { compileClientComponent, flush, mountApp } from '@/test/clientRender'
import type { RealmNodeInfo } from '@/lib/api'

// Just enough Leaflet to watch what the map does with tiles, markers and the view.
type Handler = (event: { tile: unknown }) => void
const leaflet = vi.hoisted(() => ({ markers: [] as FakeMarker[], fits: 0, cleared: 0, layer: null as null | { handlers: Map<string, Handler[]>; createTile: (coords: unknown, done: () => void) => unknown } }))
class FakeMarker {
  tooltip: unknown = null
  popup: unknown = null
  style: Record<string, unknown>
  clicks = 0
  constructor(public at: number[], style: Record<string, unknown>) {
    this.style = style
  }
  bindTooltip(content: unknown) { this.tooltip = content; return this }
  setTooltipContent(content: unknown) { this.tooltip = content; return this }
  getTooltip() { return this.tooltip }
  bindPopup(content: unknown) { this.popup = content; return this }
  setPopupContent(content: unknown) { this.popup = content; return this }
  unbindPopup() { this.popup = null; return this }
  getPopup() { return this.popup }
  setStyle(style: Record<string, unknown>) { this.style = { ...this.style, ...style }; return this }
  setRadius() { return this }
  on() { this.clicks++; return this }
  off() { this.clicks = 0; return this }
}
const L = {
  TileLayer: {
    extend: (proto: Record<string, unknown>) =>
      class {
        handlers = new Map<string, Handler[]>()
        createTile = proto.createTile as never
        getTileUrl() { return 'https://tile.example/1/2/3.png' }
        on(events: string, handler: Handler) {
          for (const name of events.split(' ')) this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler])
          return this
        }
        addTo() { leaflet.layer = this as never; return this }
      },
  },
  map: () => ({ setView: () => {}, fitBounds: () => void leaflet.fits++, remove: () => {} }),
  layerGroup: () => ({ addTo() { return this }, addLayer: () => {}, removeLayer: () => {}, clearLayers: () => void leaflet.cleared++ }),
  circleMarker: (at: number[], style: Record<string, unknown>) => {
    const marker = new FakeMarker(at, style)
    leaflet.markers.push(marker)
    return marker
  },
  latLngBounds: (points: unknown) => points,
}

const NodeGeoMap = compileClientComponent(new URL('./NodeGeoMap.vue', import.meta.url), {
  vue: VueRuntime,
  leaflet: { __esModule: true, default: L },
  'leaflet/dist/leaflet.css': {},
  '@/components/nodes/node-display': NodeDisplay,
  '@/lib/nodePlaces': NodePlaces,
})

const node = (id: string, lat: number, extra: Partial<RealmNodeInfo> = {}) =>
  ({ node_id: id, kind: 'server', configured: true, present: true, display_name: id, coordinates: { lat, lon: 8.7 }, ...extra }) as RealmNodeInfo

const urls = { made: [] as string[], revoked: [] as string[] }
const fetches: { signal: AbortSignal; answer: () => void }[] = []
beforeEach(() => {
  leaflet.markers = []
  leaflet.fits = 0
  leaflet.cleared = 0
  urls.made = []
  urls.revoked = []
  fetches.length = 0
  vi.stubGlobal('document', { createElement: (tag: string) => ({ tag, textContent: '', className: '', append() {}, addEventListener() {} }) })
  vi.stubGlobal('URL', { createObjectURL: () => (urls.made.push(`blob:${urls.made.length}`), `blob:${urls.made.length - 1}`), revokeObjectURL: (url: string) => urls.revoked.push(url) })
  vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
    new Promise((resolve) => fetches.push({ signal: init.signal, answer: () => resolve({ ok: true, blob: async () => 'bytes' }) })))
})
afterEach(() => vi.unstubAllGlobals())

async function mount(nodes: RealmNodeInfo[]) {
  const list = ref(nodes)
  const mounted = await mountApp(defineComponent(() => () => h(NodeGeoMap, { nodes: list.value })))
  return { list, ...mounted }
}

describe('node map', () => {
  it('names nodes in the tooltip as text, never as markup', async () => {
    await mount([node('<img src=x onerror=alert(1)>', 50.58)])
    const tooltip = leaflet.markers[0].tooltip as { textContent: string }
    expect(typeof tooltip).toBe('object')
    expect(tooltip.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('keeps the markers and the view through a heartbeat and fits again when a place moves', async () => {
    const { list } = await mount([node('a', 50.58), node('b', 50.8)])
    expect(leaflet.fits).toBe(1)
    list.value = [node('a', 50.58, { present: false }), node('b', 50.8)]
    await flush()
    expect(leaflet.markers).toHaveLength(2)
    expect(leaflet.cleared).toBe(0)
    expect(leaflet.fits).toBe(1)
    expect(leaflet.markers[0].style.color).toBe('#9ca3af')

    list.value = [node('a', 50.58), node('b', 51.2)]
    await flush()
    expect(leaflet.fits).toBe(2)
  })

  it('stops and frees a tile that leaves the map, a shown tile and every tile at unmount', async () => {
    const { app } = await mount([node('a', 50.58)])
    const layer = leaflet.layer!
    const unload = (tile: unknown) => layer.handlers.get('tileunload')!.forEach((handler) => handler({ tile }))
    const done = vi.fn()

    // Removed while its read runs: the read stops and no URL is made.
    const gone = layer.createTile({}, done)
    unload(gone)
    expect(fetches[0].signal.aborted).toBe(true)
    fetches[0].answer()
    await flush()
    expect(urls.made).toEqual([])

    // Shown: its URL goes once the image loaded.
    const shown = layer.createTile({}, done) as { onload: () => void; src: string }
    fetches[1].answer()
    await flush()
    shown.onload()
    expect(urls.revoked).toEqual([shown.src])

    // Read but removed before it loaded: the URL goes with the tile.
    const loading = layer.createTile({}, done) as { src: string }
    fetches[2].answer()
    await flush()
    unload(loading)
    expect(urls.revoked).toContain(loading.src)

    const open = layer.createTile({}, done)
    app.unmount()
    expect(fetches[3].signal.aborted).toBe(true)
    expect(open).toBeTruthy()
  })
})
