<script setup lang="ts">
// The realm's nodes on an OpenStreetMap map, once nodes carry coordinates. The tiles are fetched and
// shown from blob URLs, so the portal's CSP needs only the tile origin in connect-src. A marker
// stands for a place and its color for the state of the nodes there.
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

const BlobTiles = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('img')
    tile.alt = ''
    fetch(this.getTileUrl(coords))
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`Tile answered ${response.status}`))))
      .then((blob) => {
        tile.onload = () => {
          URL.revokeObjectURL(tile.src)
          done(undefined, tile)
        }
        tile.src = URL.createObjectURL(blob)
      })
      .catch((error: Error) => done(error, tile))
    return tile
  },
}) as unknown as typeof L.TileLayer

function color(nodes: RealmNodeInfo[]): string {
  const online = nodes.filter(nodeOnline).length
  if (online === nodes.length) return '#10b981'
  return online ? '#f59e0b' : '#9ca3af'
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

function draw() {
  if (!map || !markers) return
  markers.clearLayers()
  const places = groupByPlace(props.nodes)
  for (const place of places) {
    const fill = color(place.nodes)
    const marker = L.circleMarker([place.lat, place.lon], {
      radius: Math.min(14, 6 + place.nodes.length),
      color: fill,
      fillColor: fill,
      fillOpacity: 0.75,
      weight: 2,
    })
    const names = place.nodes.map(nodeName)
    marker.bindTooltip(place.nodes.length === 1 ? names[0] : `${names.length} nodes: ${names.join(', ')}`)
    if (place.nodes.length === 1) marker.on('click', () => emit('select', place.nodes[0].node_id))
    else marker.bindPopup(choices(place.nodes))
    markers.addLayer(marker)
  }
  if (places.length) map.fitBounds(L.latLngBounds(places.map((place) => [place.lat, place.lon])), { padding: [24, 24], maxZoom: 11 })
}

onMounted(() => {
  if (!element.value) return
  map = L.map(element.value, { zoomControl: true, attributionControl: true })
  new BlobTiles(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map)
  markers = L.layerGroup().addTo(map)
  map.setView([51, 10], 5)
  draw()
})
watch(() => props.nodes, draw, { deep: true })
onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div ref="element" class="h-[250px] w-full overflow-hidden rounded-md" role="region" aria-label="Map of the realm's nodes" />
</template>
