// The node refuses a crate whose data entities are not reachable from the root
// through hasPart (craqle `orphaned_data_entity`) and hides them from reads.
// The editor mirrors the rule so Validate never surprises.

import { termNameFromUri } from '@/lib/profiles/uri'
import type { CrateDraft, DraftEntity } from './editor'

/** The types that describe stored data; a contextual entity is none of them. */
export const DATA_TYPES = ['File', 'Dataset', 'MediaObject']

export function isDataType(type: string): boolean {
  return DATA_TYPES.includes(termNameFromUri(type))
}

/** The ids one entity lists under hasPart, empty prompts left out. */
export function partsOf(entity: DraftEntity | undefined): string[] {
  return (entity?.properties.hasPart ?? [])
    .filter((value) => value.kind === 'reference' && value.value.trim())
    .map((value) => value.value)
}

/**
 * The data entities no hasPart chain reaches from the root. Like the node, an
 * entity counts as data when it carries a data type or takes part in a hasPart
 * link at all.
 */
export function orphanedDataEntities(draft: CrateDraft): DraftEntity[] {
  const root = draft.entities[0]?.id
  if (!root) return []
  const reachable = new Set([root])
  const queue = [root]
  while (queue.length) {
    const current = queue.shift() as string
    for (const part of partsOf(draft.entities.find((entity) => entity.id === current))) {
      if (!reachable.has(part)) {
        reachable.add(part)
        queue.push(part)
      }
    }
  }
  const linked = new Set(draft.entities.flatMap((entity) => partsOf(entity)))
  return draft.entities.filter((entity) => {
    if (entity.id === root || reachable.has(entity.id)) return false
    return entity.types.some(isDataType) || linked.has(entity.id) || partsOf(entity).length > 0
  })
}
