<script setup lang="ts">
// The realm's nodes on an OpenStreetMap map, once nodes carry coordinates. The tiles are fetched and
// shown from blob URLs, so the portal's CSP needs only the tile origin in connect-src. A marker
// stands for a place and its color for the state of the nodes there. A heartbeat updates the
// markers in place; the view fits the places again only when they move.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { nodeName, nodeOnline } from '@/components/nodes/node-display'
import type { RealmNodeInfo } from '@/lib/api'
import { groupByPlace, OSM_ATTRIBUTION, OSM_TILE_URL } from '@/lib/nodePlaces'

const props = defineProps<{ nodes: RealmNodeInfo[] }>()
const emit = defineEmits<{ select: [nodeId: string] }>()

const element = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let markers: L.LayerGroup | null = null

// Each tile's read and blob URL, released once it shows, fails, leaves the map or the map goes.
const tiles = new Map<HTMLElement, { controller: AbortController; url?: string }>()
function release(tile: HTMLElement) {
  const entry = tiles.get(tile)
  if (!entry) return
  tiles.delete(tile)
  entry.controller.abort()
  if (entry.url) URL.revokeObjectURL(entry.url)
}

const BlobTiles = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('img')
    tile.alt = ''
    const entry: { controller: AbortController; url?: string } = { controller: new AbortController() }
    tiles.set(tile, entry)
    fetch(this.getTileUrl(coords), { signal: entry.controller.signal })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`Tile answered ${response.status}`))))
      .then((blob) => {
        if (entry.controller.signal.aborted) return
        tile.onload = () => {
          release(tile)
          done(undefined, tile)
        }
        tile.onerror = () => {
          release(tile)
          done(new Error('The tile could not be shown'), tile)
        }
        entry.url = URL.createObjectURL(blob)
        tile.src = entry.url
      })
      .catch((error: Error) => {
        if (entry.controller.signal.aborted) return
        release(tile)
        done(error, tile)
      })
    return tile
  },
}) as unknown as typeof L.TileLayer

function color(nodes: RealmNodeInfo[]): string {
  const online = nodes.filter(nodeOnline).length
  if (online === nodes.length) return '#10b981'
  return online ? '#f59e0b' : '#9ca3af'
}

// Names reach Leaflet as text, never as markup.
function label(text: string): HTMLElement {
  const element = document.createElement('span')
  element.textContent = text
  return element
}

// A place with one node opens it; a place with several offers them by name.
function choices(nodes: RealmNodeInfo[]): HTMLElement {
  const list = document.createElement('div')
  list.className = 'flex flex-col gap-1 text-xs'
  for (const node of nodes) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'text-left text-primary hover:underline'
    button.textContent = nodeName(node)
    button.addEventListener('click', () => emit('select', node.node_id))
    list.append(button)
  }
  return list
}

const placed = new Map<string, L.CircleMarker>()
let fitted = ''
function draw() {
  if (!map || !markers) return
  const places = groupByPlace(props.nodes)
  const keys = places.map((place) => `${place.lat},${place.lon}`)
  for (const [key, marker] of placed) {
    if (keys.includes(key)) continue
    markers.removeLayer(marker)
    placed.delete(key)
  }
  places.forEach((place, index) => {
    const fill = color(place.nodes)
    const style = { radius: Math.min(14, 6 + place.nodes.length), color: fill, fillColor: fill, fillOpacity: 0.75, weight: 2 }
    let marker = placed.get(keys[index])
    if (marker) {
      marker.setStyle(style)
      marker.setRadius(style.radius)
    } else {
      marker = L.circleMarker([place.lat, place.lon], style)
      placed.set(keys[index], marker)
      markers!.addLayer(marker)
    }
    const names = place.nodes.map(nodeName)
    const tooltip = label(place.nodes.length === 1 ? names[0] : `${names.length} nodes: ${names.join(', ')}`)
    if (marker.getTooltip()) marker.setTooltipContent(tooltip)
    else marker.bindTooltip(tooltip)
    marker.off('click')
    if (place.nodes.length === 1) {
      marker.unbindPopup()
      const nodeId = place.nodes[0].node_id
      marker.on('click', () => emit('select', nodeId))
    } else if (marker.getPopup()) marker.setPopupContent(choices(place.nodes))
    else marker.bindPopup(choices(place.nodes))
  })
  // A heartbeat keeps the reader's zoom and pan; new or moved places are fitted again.
  const shown = [...keys].sort().join(';')
  if (places.length && shown !== fitted) map.fitBounds(L.latLngBounds(places.map((place) => [place.lat, place.lon])), { padding: [24, 24], maxZoom: 11 })
  fitted = shown
}

onMounted(() => {
  if (!element.value) return
  map = L.map(element.value, { zoomControl: true, attributionControl: true })
  new BlobTiles(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION })
    .on('tileunload tileabort', (event) => release((event as L.TileEvent).tile))
    .addTo(map)
  markers = L.layerGroup().addTo(map)
  map.setView([51, 10], 5)
  draw()
})
watch(() => props.nodes, draw, { deep: true })
onBeforeUnmount(() => {
  map?.remove()
  map = null
  for (const tile of [...tiles.keys()]) release(tile)
})
</script>

<template>
  <div ref="element" class="h-[250px] w-full overflow-hidden rounded-md" role="region" aria-label="Map of the realm's nodes" />
</template>
