// Every crate graph in the portal reads this model: one node per entity plus a
// ghost node for every reference leaving the crate, and one edge per reference
// value. Building it is pure, so the views only have to draw what it answers.

import dagre from 'dagre'
import { formatContentSize, isDataEntity, isLeafFile } from '@/lib/dataEntities'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import {
  displayName,
  fromRoCrate,
  propertyTerm,
  rootId,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
} from './editor'
import { partsOf } from './orphans'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

export type GraphNodeKind = 'root' | 'file' | 'dataset' | 'contextual' | 'external'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  badge: string
  label: string
  /** One muted line under the name: size and format, parts, type or host. */
  facts: string
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

export const NODE_WIDTH = 220
export const NODE_HEIGHT = 64

/** Above this many nodes a graph starts with contextual entities hidden. */
export const CONTEXT_LIMIT = 40
/** Above this many nodes a graph shows a minimap. */
export const MINIMAP_LIMIT = 30

export const BADGES: Readonly<Record<GraphNodeKind, string>> = {
  root: 'Root',
  file: 'File',
  dataset: 'Dataset',
  contextual: 'Contextual',
  external: 'External',
}

function isDraft(source: unknown): source is CrateDraft {
  return Boolean(source) && Array.isArray((source as CrateDraft).entities)
}

/** The editor's draft as it is; the RO-Crate JSON a page loaded, parsed. */
export function toDraft(source: unknown): CrateDraft {
  return isDraft(source) ? source : fromRoCrate(source)
}

function kindOf(draft: CrateDraft, entity: DraftEntity): GraphNodeKind {
  if (entity.id === rootId(draft)) return 'root'
  if (isLeafFile(entity.types)) return 'file'
  return isDataEntity(entity.types) ? 'dataset' : 'contextual'
}

function hostOf(id: string): string {
  try {
    return new URL(id).host
  } catch {
    return ''
  }
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function factsOf(kind: GraphNodeKind, entity: DraftEntity): string {
  const first = (property: string) => entity.properties[property]?.[0]?.value.trim() ?? ''
  switch (kind) {
    case 'root':
    case 'dataset':
      return count(partsOf(entity).length, 'part')
    case 'file': {
      const size = first('contentSize')
      return [size ? formatContentSize(size) : '', first('encodingFormat')].filter(Boolean).join(' · ')
    }
    case 'contextual':
      return entity.types.map(typeLabel).join(', ')
    case 'external':
      return hostOf(entity.id)
  }
}

/** Every entity and every reference between them, ghost targets included. */
export function crateGraph(source: unknown, vocab: VocabIndex | null = null): CrateGraphModel {
  const draft = toDraft(source)
  const nodes: GraphNode[] = draft.entities.map((entity) => {
    const kind = kindOf(draft, entity)
    return {
      id: entity.id,
      kind,
      badge: BADGES[kind],
      label: displayName(entity),
      facts: factsOf(kind, entity),
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
            facts: hostOf(target) || 'Not in this crate',
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

/** The root and its data only; what a large crate shows first. */
export function dataOnly(model: CrateGraphModel): CrateGraphModel {
  const nodes = model.nodes.filter((node) => node.kind !== 'contextual' && node.kind !== 'external')
  const kept = new Set(nodes.map((node) => node.id))
  return { nodes, edges: model.edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)) }
}

/** What the graph shows, for its accessible name. */
export function describeGraph(model: CrateGraphModel): string {
  const root = model.nodes.find((node) => node.kind === 'root')
  const entities = count(model.nodes.length, 'entity', 'entities')
  return `${root?.label || 'Crate'}: ${entities}, ${count(model.edges.length, 'reference')}`
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
