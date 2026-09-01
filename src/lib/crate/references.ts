// One way to write a reference. Every writer (a property row, the graph, the
// data picker, "Link to this dataset as", a profile) links through here, so a
// target lands in a property exactly once and unlinking never leaves the node
// a data entity it would refuse.

import {
  addEntity,
  addValue,
  findEntity,
  removeEntity,
  removeValue,
  rootId,
  setProperty,
  textKind,
  type CrateDraft,
  type DraftEntity,
  type DraftValue,
} from './editor'
import { orphanedDataEntities } from './orphans'
import { RO_CRATE_PROFILE_IRI, type SubcrateLink } from '@/lib/subcrates'

/** Where a picked reference lands: one property of one entity. */
export interface ReferenceTarget {
  entityId: string
  property: string
}

/** The dataset's own parts list, what the browser toolbar writes to. */
export function rootParts(draft: CrateDraft): ReferenceTarget {
  return { entityId: rootId(draft), property: 'hasPart' }
}

/** Links a target once: a duplicate is ignored and an empty row is filled. */
export function linkReference(
  draft: CrateDraft,
  entityId: string,
  property: string,
  targetId: string,
): CrateDraft {
  const target = targetId.trim()
  if (!target) return draft
  const list = findEntity(draft, entityId)?.properties[property] ?? []
  if (list.some((value) => value.kind === 'reference' && value.value === target)) return draft
  const blank = list.findIndex((value) => value.kind === 'reference' && !value.value.trim())
  if (blank < 0) return addValue(draft, entityId, property, { kind: 'reference', value: target })
  return setProperty(draft, entityId, property, list.map((value, index) =>
    (index === blank ? { kind: 'reference' as const, value: target } : value)))
}

/** The data entity that would stop being reachable once this reference goes. */
export function orphanAfterUnlink(
  draft: CrateDraft,
  entityId: string,
  property: string,
  index: number,
): DraftEntity | undefined {
  const value = findEntity(draft, entityId)?.properties[property]?.[index]
  if (value?.kind !== 'reference' || !value.value.trim()) return undefined
  const next = removeValue(draft, entityId, property, index)
  return orphanedDataEntities(next).find((entity) => entity.id === value.value)
}

export interface UnlinkOptions {
  /** Drops the whole row instead of clearing it back to a prompt. */
  dropRow?: boolean
  /** Takes the target with it, which the node would otherwise refuse. */
  removeTarget?: boolean
}

/** Removes one reference, and the entity it held when nothing else can reach it. */
export function unlinkReference(
  draft: CrateDraft,
  entityId: string,
  property: string,
  index: number,
  options: UnlinkOptions = {},
): CrateDraft {
  const list = findEntity(draft, entityId)?.properties[property] ?? []
  const value = list[index]
  const next = options.dropRow
    ? removeValue(draft, entityId, property, index)
    : setProperty(draft, entityId, property, list.map((entry, position) =>
      (position === index ? { ...entry, value: '' } : entry)))
  if (!options.removeTarget || value?.kind !== 'reference' || !value.value.trim()) return next
  return removeEntity(next, value.value).draft
}

export interface FilePart {
  id: string
  name: string
  /** `Dataset` for a picked folder; `File` for a single object. */
  type?: string
  contentUrl?: string
  encodingFormat?: string
  contentSize?: string
}

function reference(id: string): DraftValue[] {
  return [{ kind: 'reference', value: id }]
}

function textValue(value: string): DraftValue[] {
  return [{ kind: textKind(value), value }]
}

/** A stored object as a data entity, linked from the target that picked it. */
export function addFilePart(
  draft: CrateDraft,
  part: FilePart,
  target: ReferenceTarget = rootParts(draft),
): CrateDraft {
  const properties: Record<string, DraftValue[]> = {
    name: textValue(part.name || part.id),
    ...(part.contentUrl ? { contentUrl: textValue(part.contentUrl) } : {}),
    ...(part.encodingFormat ? { encodingFormat: textValue(part.encodingFormat) } : {}),
    ...(part.contentSize ? { contentSize: textValue(part.contentSize) } : {}),
  }
  const added = addEntity(draft, { type: part.type ?? 'File', id: part.id, properties })
  return linkReference(added.draft, target.entityId, target.property, part.id)
}

/** A referenced dataset, per the RO-Crate rules for linking another crate. */
export function addSubcratePart(
  draft: CrateDraft,
  link: SubcrateLink,
  target: ReferenceTarget = rootParts(draft),
): CrateDraft {
  const properties: Record<string, DraftValue[]> = {
    name: textValue(link.name),
    conformsTo: reference(RO_CRATE_PROFILE_IRI),
    ...(link.identifier ? { identifier: textValue(link.identifier) } : {}),
    ...(link.subjectOf ? { subjectOf: reference(link.subjectOf) } : {}),
  }
  let next = addEntity(draft, { type: 'Dataset', id: link.iri, properties }).draft
  if (link.subjectOf) {
    next = addEntity(next, {
      type: 'CreativeWork',
      id: link.subjectOf,
      properties: { encodingFormat: textValue('application/ld+json') },
    }).draft
  }
  return linkReference(next, target.entityId, target.property, link.iri)
}
