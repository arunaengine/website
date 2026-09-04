// Draws the peer links of a landing page node graph and lays the packets'
// paths along them. The lines are measured from the rendered cards, so they
// follow every layout and resize; nothing here is animated, CSS does that.
import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { boxIn, linkPath, segment, type Box } from '@/lib/landing/graphLinks'

const SVG = 'http://www.w3.org/2000/svg'
/** How far outside a card its links begin, so a packet's bloom clears the edge. */
const LINK_GAP = 14

function offsetPathsWork(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    && CSS.supports('offset-path', 'path("M0 0 L1 1")')
}

/**
 * `links` names node pairs as `a-b`, where `a` and `b` are `data-node` ids
 * inside `root`. Packets are elements carrying `data-from` and `data-to`.
 */
export function useGraphLinks(root: Ref<HTMLElement | null>, links: string[]) {
  let observer: ResizeObserver | null = null

  function draw() {
    const graph = root.value
    const svg = graph?.querySelector<SVGSVGElement>('svg[data-links]')
    if (!graph || !svg) return
    const rootRect = graph.getBoundingClientRect()
    const boxes = new Map<string, Box>()
    for (const node of graph.querySelectorAll<HTMLElement>('[data-node]')) {
      boxes.set(node.dataset.node ?? '', boxIn(node.getBoundingClientRect(), rootRect))
    }
    const between = (a: string, b: string) => {
      const from = boxes.get(a)
      const to = boxes.get(b)
      return from && to ? segment(from, to, LINK_GAP) : null
    }
    svg.setAttribute('viewBox', `0 0 ${graph.clientWidth} ${graph.clientHeight}`)
    svg.replaceChildren()
    for (const pair of links) {
      const [a, b] = pair.split('-')
      const link = between(a, b)
      if (!link) continue
      // A soft glow line sits under the crisp one; the CSS lights it in use.
      for (const kind of ['link-glow', 'link']) {
        const line = document.createElementNS(SVG, 'line')
        line.setAttribute('x1', String(link.from.x))
        line.setAttribute('y1', String(link.from.y))
        line.setAttribute('x2', String(link.to.x))
        line.setAttribute('y2', String(link.to.y))
        line.setAttribute('class', `${kind} ${kind}-${pair}`)
        svg.append(line)
      }
    }
    for (const packet of graph.querySelectorAll<HTMLElement>('[data-from][data-to]')) {
      const link = between(packet.dataset.from ?? '', packet.dataset.to ?? '')
      if (link) packet.style.offsetPath = linkPath(link)
    }
  }

  onMounted(() => {
    const graph = root.value
    if (!graph) return
    // A browser without offset paths shows the links and keeps the packets away.
    if (!offsetPathsWork()) graph.classList.add('no-offset')
    draw()
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => draw())
      observer.observe(graph)
    }
    document.fonts?.ready.then(() => draw()).catch(() => undefined)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { draw }
}
