// Profile-aware presenter behind the metadata landing page. One linear pass
// assigns every crate entity exactly one home — hero, data table, related list,
// person/organization card, or context block — and turns the root's and every
// context entity's remaining properties into labeled, profile-ordered fields.

import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { readableIri } from '@/lib/identifiers'
import { isHttpUrl } from '@/lib/utils'
import { isDatasetType, termNameFromUri } from '@/lib/profiles/uri'
import type { ProfileEntityRule } from '@/lib/profiles/types'
import {
  cardEntity,
  entityKind,
  isRecord,
  isStub,
  personName,
  refId,
  toArray,
  typesOf,
  type ContextualEntity,
  type EntityIndex,
  type EntityKind,
} from '@/lib/contextualEntities'

export interface PresentedValue {
  text: string
  /** Absolute http(s) target; anything else never becomes a link. */
  href?: string
  /** Entity anchor on this page (a card or context block). */
  jumpId?: string
  /** Full raw value when `text` is shortened or reformatted. */
  title?: string
  /** Long prose, rendered collapsed. */
  long?: boolean
}

export interface PresentedField {
  /** Compact machine term (JSON-LD key tail). */
  key: string
  label: string
  profiled: boolean
  description?: string
  values: PresentedValue[]
}

export interface PresentedEntity {
  id: string
  name: string
  /** Compact type tokens for display. */
  types: string[]
  kind: EntityKind
  /** Matched profile entity rule's label. */
  profileLabel?: string
  /** Labels of the root properties referencing this entity. */
  relations: string[]
  fields: PresentedField[]
  unresolved: boolean
}

export interface CommentEntry {
  id: string
  text: string
  authorName?: string
  created?: string
}

export interface CratePresentation {
  /** Root literal properties the hero does not already show. */
  fields: PresentedField[]
  people: ContextualEntity[]
  organizations: ContextualEntity[]
  entities: PresentedEntity[]
  comments: CommentEntry[]
}

export interface PresentOptions {
  /** Ids owned by other sections (subcrate links, run provenance). */
  excludeIds?: Iterable<string>
  /** Resolved profile entity rules driving labels and field order. */
  profile?: ProfileEntityRule[]
}

// Root properties whose content the hero already shows.
const HERO_REF_PROPS = ['author', 'creator', 'contributor', 'license', 'conformsTo']
const HERO_PROPS = new Set(['name', 'description', 'keywords', ...HERO_REF_PROPS])
// Root reference properties owned by the related-resources list and data table.
const RELATED_PROPS = ['mentions', 'citation', 'about']
const DATA_PROPS = ['hasPart']
// Root roles that badge card entities (hero-owned roles never render cards).
const CARD_ROLES: Array<[string, string]> = [
  ['publisher', 'Publisher'],
  ['sdPublisher', 'Publisher'],
  ['funder', 'Funder'],
  ['maintainer', 'Maintainer'],
  ['copyrightHolder', 'Copyright holder'],
]
const ROLE_KINDS: Record<string, 'people' | 'organizations'> = {
  Publisher: 'organizations',
  Funder: 'organizations',
  'Copyright holder': 'organizations',
  Maintainer: 'people',
}
const DATA_TYPES = new Set(['File', 'Dataset', 'MediaObject'])
const ROOT_SKIP = new Set([...HERO_PROPS, ...RELATED_PROPS, ...DATA_PROPS, ...CARD_ROLES.map(([p]) => p)])
const CONTEXT_SKIP = new Set(['name'])
const LONG_TEXT = 280
const UNPROFILED = Number.MAX_SAFE_INTEGER

type Home = 'card' | 'context' | 'comment' | 'claimed'

interface FieldRule {
  label: string
  order: number
  description?: string
}

interface EntityRuleMatch {
  label?: string
  fields: Map<string, FieldRule>
}

interface RuleIndex {
  root: Map<string, FieldRule>
  byType: Map<string, EntityRuleMatch>
  /** className alias -> canonical short type name (e.g. Author -> Person). */
  alias: Map<string, string>
}

// Identifier and format acronyms a lowercase key cannot signal on its own, so
// `doi` reads "DOI" rather than "Doi". Profile labels always win over this.
const ACRONYMS = new Set([
  'api', 'csv', 'doi', 'html', 'id', 'iri', 'isbn', 'issn', 'json', 'md5',
  'orcid', 'pdf', 'ror', 'sha256', 'uri', 'url', 'xml',
])

/** Sentence-case display label for a raw JSON-LD key or term URI. */
export function prettifyKey(key: string): string {
  const spaced = termNameFromUri(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
  if (!spaced) return key
  const words = spaced.split(/\s+/).map((word, i) => {
    if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase()
    return i > 0 && /^[A-Z][a-z]/.test(word) ? word.charAt(0).toLowerCase() + word.slice(1) : word
  })
  const joined = words.join(' ')
  return /^[a-z]/.test(joined) ? joined.charAt(0).toUpperCase() + joined.slice(1) : joined
}

function buildRuleIndex(rules: ProfileEntityRule[]): RuleIndex {
  const index: RuleIndex = { root: new Map(), byType: new Map(), alias: new Map() }
  for (const entity of rules) {
    const fields = new Map<string, FieldRule>()
    entity.propertyRules.forEach((rule, order) => {
      const key = rule.valueName || rule.id
      if (key && !fields.has(key)) {
        fields.set(key, { label: rule.label || prettifyKey(key), order, description: rule.description || undefined })
      }
    })
    if (isDatasetType(entity.type)) {
      if (!index.root.size) index.root = fields
      continue
    }
    const typeName = termNameFromUri(entity.type)
    const match: EntityRuleMatch = { label: entity.label || undefined, fields }
    for (const key of new Set([entity.className, typeName, entity.type].filter(Boolean))) {
      if (!index.byType.has(key)) index.byType.set(key, match)
    }
    if (entity.className && typeName && entity.className !== typeName && !index.alias.has(entity.className)) {
      index.alias.set(entity.className, typeName)
    }
  }
  return index
}

// Profile className aliases resolve to their canonical short type name, so an
// aliased `@type` (e.g. `Author` over schema.org/Person) still routes to cards.
function effectiveTypes(types: string[], rules: RuleIndex): string[] {
  if (!rules.alias.size) return types
  return types.map((type) => rules.alias.get(type) ?? type)
}

function ruleFor(types: string[], rules: RuleIndex): EntityRuleMatch | undefined {
  for (const type of types) {
    const match = rules.byType.get(type) ?? rules.byType.get(termNameFromUri(type))
    if (match) return match
  }
  return undefined
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const dateFormat = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

function literalValue(text: string): PresentedValue {
  if (DATE_ONLY.test(text)) {
    const parsed = Date.parse(text)
    if (Number.isFinite(parsed)) return { text: dateFormat.format(parsed), title: text }
  } else if (DATE_TIME.test(text)) {
    const parsed = Date.parse(text)
    if (Number.isFinite(parsed)) return { text: `${dateTimeFormat.format(parsed)} UTC`, title: text }
  }
  const long = text.length > LONG_TEXT
  if (isHttpUrl(text)) return { text, href: text }
  return long ? { text, long: true } : { text }
}

function pointerValue(id: string, target: Record<string, unknown> | undefined, homes: Map<string, Home>): PresentedValue {
  const text = stringProp(target?.name) || personName(target) || readableIri(id)
  const home = homes.get(id)
  if (home === 'card' || home === 'context') return { text, jumpId: id, title: id }
  if (isHttpUrl(id)) return { text, href: id, title: id }
  return { text, title: id }
}

// Compact one-line rendering for an inline blank node (e.g. a nested address).
function inlineSummary(node: Record<string, unknown>): PresentedValue | undefined {
  const parts: string[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@')) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${prettifyKey(key)}: ${value}`)
    }
    if (parts.length >= 6) break
  }
  if (parts.length) return { text: parts.join(' · ') }
  const name = stringProp(node.name)
  return name ? { text: name } : undefined
}

interface FieldRow extends PresentedField {
  order: number
}

// All of an entity's remaining properties as display fields: profile-labeled
// fields first in profile order, everything else alphabetical with prettified
// keys. PropertyValue values (inline or referenced) surface as their own
// labeled rows instead of raw references.
function entityFields(
  entity: Record<string, unknown>,
  ruleFields: Map<string, FieldRule> | undefined,
  byId: EntityIndex,
  homes: Map<string, Home>,
  skip: Set<string>,
  refMode: 'pointer' | 'drop',
): PresentedField[] {
  const rows = new Map<string, FieldRow>()
  const push = (key: string, explicitLabel: string | undefined, value: PresentedValue) => {
    const rule = ruleFields?.get(key)
    let row = rows.get(key)
    if (!row) {
      row = {
        key: termNameFromUri(key),
        label: rule?.label ?? explicitLabel ?? prettifyKey(key),
        profiled: Boolean(rule),
        description: rule?.description,
        values: [],
        order: rule?.order ?? UNPROFILED,
      }
      rows.set(key, row)
    }
    row.values.push(value)
  }
  const pushDerived = (node: Record<string, unknown>) => {
    const key = stringProp(node.propertyID) || stringProp(node.name)
    const raw = stringProp(node.value)
    if (!key || raw === undefined) return
    const unit = stringProp(node.unitText) ?? stringProp(node.unitCode)
    const base = literalValue(raw)
    push(key, stringProp(node.name), unit && !base.href ? { ...base, text: `${base.text} ${unit}` } : base)
  }
  const pushRef = (key: string, id: string, target: Record<string, unknown> | undefined) => {
    if (target && typesOf(target).includes('PropertyValue')) {
      pushDerived(target)
      return
    }
    // Root mode: refs into the graph became relation chips or live in other
    // sections; only refs to values outside the graph stay as rows.
    if (refMode === 'drop' && target) return
    push(key, undefined, pointerValue(id, target, homes))
  }

  for (const [key, raw] of Object.entries(entity)) {
    if (key.startsWith('@') || skip.has(key)) continue
    for (const value of toArray(raw)) {
      if (typeof value === 'string') {
        const target = byId.get(value)
        if (target) pushRef(key, value, target)
        else push(key, undefined, literalValue(value))
        continue
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        push(key, undefined, { text: String(value) })
        continue
      }
      if (!isRecord(value)) continue
      const inner = value['@value']
      if (typeof inner === 'string' || typeof inner === 'number' || typeof inner === 'boolean') {
        push(key, undefined, literalValue(String(inner)))
        continue
      }
      const id = typeof value['@id'] === 'string' ? value['@id'] : ''
      if (id) {
        pushRef(key, id, byId.get(id))
        continue
      }
      if (typesOf(value).includes('PropertyValue')) {
        pushDerived(value)
        continue
      }
      const summary = inlineSummary(value)
      if (summary) push(key, undefined, summary)
    }
  }

  return [...rows.values()]
    .filter((row) => row.values.length)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'en'))
    .map(({ order: _order, ...row }) => row)
}

const EMPTY: CratePresentation = { fields: [], people: [], organizations: [], entities: [], comments: [] }

export function presentCrate(crate: unknown, options: PresentOptions = {}): CratePresentation {
  const graph = crateGraph(crate)
  if (!graph.length) return EMPTY
  const rootId = crateRootId(crate)
  const byId: EntityIndex = new Map()
  for (const entity of graph) {
    const id = entity['@id']
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, entity)
  }
  const root = rootId ? byId.get(rootId) : undefined
  const rules = buildRuleIndex(options.profile ?? [])

  // Every id another section already shows: descriptor, root, excluded ids,
  // hero references, related references and data entities.
  const claimed = new Set<string>(['ro-crate-metadata.json'])
  if (rootId) claimed.add(rootId)
  for (const id of options.excludeIds ?? []) claimed.add(id)
  for (const property of [...HERO_REF_PROPS, ...DATA_PROPS]) {
    for (const value of toArray(root?.[property])) {
      const id = refId(value)
      if (id) claimed.add(id)
    }
  }
  for (const property of RELATED_PROPS) {
    for (const value of toArray(root?.[property])) {
      const id = refId(value)
      // Crate-local fragments are internal wiring the related list skips.
      if (id && !id.startsWith('#')) claimed.add(id)
    }
  }

  const roleIndex = new Map<string, string[]>()
  for (const [property, role] of CARD_ROLES) {
    for (const value of toArray(root?.[property])) {
      const id = refId(value)
      if (!id || claimed.has(id)) continue
      const roles = roleIndex.get(id) ?? []
      if (!roles.includes(role)) roles.push(role)
      roleIndex.set(id, roles)
    }
  }

  // Remaining root properties referencing a graph entity become relation labels
  // on that entity instead of detail rows, so each property surfaces in exactly
  // one place; refs outside the graph stay plain detail values.
  const relationIndex = new Map<string, string[]>()
  for (const [key, raw] of Object.entries(root ?? {})) {
    if (key.startsWith('@') || ROOT_SKIP.has(key)) continue
    for (const value of toArray(raw)) {
      const id = refId(value)
      if (!id || !byId.has(id) || claimed.has(id) || typesOf(byId.get(id)).includes('PropertyValue')) continue
      const label = rules.root.get(key)?.label ?? prettifyKey(key)
      const labels = relationIndex.get(id) ?? []
      if (!labels.includes(label)) labels.push(label)
      relationIndex.set(id, labels)
    }
  }

  const homes = new Map<string, Home>()
  const cardKinds = new Map<string, 'people' | 'organizations'>()
  const cardIds: string[] = []
  const contextIds: string[] = []
  const commentIds: string[] = []
  for (const entity of graph) {
    const id = entity['@id']
    if (typeof id !== 'string' || homes.has(id) || claimed.has(id) || byId.get(id) !== entity) continue
    const types = effectiveTypes(typesOf(entity), rules)
    if (types.includes('PropertyValue') || types.some((t) => DATA_TYPES.has(t))) {
      homes.set(id, 'claimed')
      continue
    }
    const kind = entityKind(types)
    const roleKind = ROLE_KINDS[roleIndex.get(id)?.[0] ?? '']
    if (kind === 'people' || kind === 'organizations' || (kind === 'other' && roleKind)) {
      homes.set(id, 'card')
      cardKinds.set(id, kind === 'other' ? (roleKind as 'people' | 'organizations') : kind)
      cardIds.push(id)
    } else if (kind === 'comments') {
      homes.set(id, 'comment')
      commentIds.push(id)
    } else {
      homes.set(id, 'context')
      contextIds.push(id)
    }
  }
  // Role references without a graph entity still earn a stub card.
  for (const [id, roles] of roleIndex) {
    if (homes.has(id) || claimed.has(id)) continue
    homes.set(id, 'card')
    cardKinds.set(id, ROLE_KINDS[roles[0] ?? ''] ?? 'people')
    cardIds.push(id)
  }

  const people: ContextualEntity[] = []
  const organizations: ContextualEntity[] = []
  for (const id of cardIds) {
    const roles = [...(roleIndex.get(id) ?? []), ...(relationIndex.get(id) ?? [])]
    const row = cardEntity(id, byId.get(id), roles, byId)
    if ((cardKinds.get(id) ?? 'people') === 'people') people.push(row)
    else organizations.push(row)
  }

  const entities = contextIds.map((id): PresentedEntity => {
    const entity = byId.get(id)
    const types = typesOf(entity)
    const match = entity ? ruleFor([...types, ...effectiveTypes(types, rules)], rules) : undefined
    return {
      id,
      name: stringProp(entity?.name) || personName(entity) || readableIri(id),
      types: types.map(termNameFromUri),
      kind: entityKind(effectiveTypes(types, rules)),
      profileLabel: match?.label,
      relations: relationIndex.get(id) ?? [],
      fields: entity ? entityFields(entity, match?.fields, byId, homes, CONTEXT_SKIP, 'pointer') : [],
      unresolved: isStub(entity),
    }
  })

  const comments = commentIds.map((id): CommentEntry => {
    const row = cardEntity(id, byId.get(id), [], byId)
    return { id, text: row.text || row.name, authorName: row.authorName, created: row.created }
  })

  return {
    fields: root ? entityFields(root, rules.root, byId, homes, ROOT_SKIP, 'drop') : [],
    people,
    organizations,
    entities,
    comments,
  }
}
