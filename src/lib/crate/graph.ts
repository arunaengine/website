// The dataset editor's graph view reads this model: one node per entity plus a
// ghost node for every reference leaving the crate, and one edge per reference
// value. Building it is pure, so the view only has to draw what it answers.

import dagre from 'dagre'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import {
  displayName,
  entityGroup,
  findEntity,
  partIds,
  propertyTerm,
  typeLabel,
  type CrateDraft,
} from './editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

export type GraphNodeKind = 'root' | 'file' | 'dataset' | 'contextual' | 'external'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  badge: string
  label: string
  types: string[]
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  property: string
  label: string
}

export interface CrateGraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Placed<T> {
  node: T
  x: number
  y: number
}

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 76

const BADGES: Readonly<Record<GraphNodeKind, string>> = {
  root: 'Root',
  file: 'File',
  dataset: 'Dataset',
  contextual: 'Contextual',
  external: 'External',
}

function kindOf(draft: CrateDraft, entityId: string, parts: Set<string>): GraphNodeKind {
  const entity = findEntity(draft, entityId)
  if (!entity) return 'external'
  const group = entityGroup(draft, entity, parts)
  if (group === 'root') return 'root'
  if (group !== 'data') return 'contextual'
  return entity.types.map(typeLabel).includes('File') ? 'file' : 'dataset'
}

/** Every entity and every reference between them, ghost targets included. */
export function crateGraph(draft: CrateDraft, vocab: VocabIndex | null = null): CrateGraphModel {
  const parts = partIds(draft)
  const nodes: GraphNode[] = draft.entities.map((entity) => {
    const kind = kindOf(draft, entity.id, parts)
    return {
      id: entity.id,
      kind,
      badge: BADGES[kind],
      label: displayName(entity),
      types: entity.types.map(typeLabel),
    }
  })
  const known = new Set(nodes.map((node) => node.id))
  const edges: GraphEdge[] = []
  for (const entity of draft.entities) {
    for (const [property, list] of Object.entries(entity.properties)) {
      for (const [index, value] of list.entries()) {
        if (value.kind !== 'reference' || !value.value.trim()) continue
        const target = value.value
        if (!known.has(target)) {
          known.add(target)
          nodes.push({
            id: target,
            kind: 'external',
            badge: BADGES.external,
            label: target,
            types: isAbsoluteUri(target) ? ['URL'] : [],
          })
        }
        edges.push({
          id: `${entity.id}|${property}|${index}`,
          source: entity.id,
          target,
          property,
          label: propertyTerm(vocab, property)?.label ?? property,
        })
      }
    }
  }
  return { nodes, edges }
}

/** A layered top-down layout; the root ends up above what it points at. */
export function layoutGraph(model: CrateGraphModel): Array<Placed<GraphNode>> {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of model.nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const edge of model.edges) graph.setEdge(edge.source, edge.target)
  dagre.layout(graph)
  return model.nodes.map((node) => {
    const placed = graph.node(node.id)
    return {
      node,
      x: (placed?.x ?? 0) - NODE_WIDTH / 2,
      y: (placed?.y ?? 0) - NODE_HEIGHT / 2,
    }
  })
}
