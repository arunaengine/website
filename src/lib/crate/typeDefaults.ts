// The properties a new entity starts with, per type: the handful people fill in
// almost every time, offered as empty rows. The vocabulary has the last word on
// which of them exist and what kind of value they take.

import {
  allowedKinds,
  defaultValue,
  propertyTerm,
  typeLabel,
  vocabTypeUri,
  type DraftValue,
  type DraftValueKind,
} from './editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

export interface DefaultProperty {
  key: string
  kind: DraftValueKind
}

// Keyed by schema.org class name; a subclass inherits the nearest entry.
const BY_TYPE: Readonly<Record<string, ReadonlyArray<DefaultProperty>>> = {
  Person: [
    { key: 'givenName', kind: 'text' },
    { key: 'familyName', kind: 'text' },
    { key: 'affiliation', kind: 'reference' },
  ],
  Organization: [{ key: 'url', kind: 'url' }],
  ContactPoint: [
    { key: 'email', kind: 'text' },
    { key: 'contactType', kind: 'text' },
  ],
  CreativeWork: [
    { key: 'url', kind: 'url' },
    { key: 'datePublished', kind: 'date' },
    { key: 'author', kind: 'reference' },
  ],
  WebPage: [{ key: 'url', kind: 'url' }],
  ScholarlyArticle: [
    { key: 'url', kind: 'url' },
    { key: 'datePublished', kind: 'date' },
    { key: 'author', kind: 'reference' },
  ],
  SoftwareSourceCode: [
    { key: 'codeRepository', kind: 'url' },
    { key: 'programmingLanguage', kind: 'text' },
    { key: 'version', kind: 'text' },
  ],
  SoftwareApplication: [
    { key: 'url', kind: 'url' },
    { key: 'softwareVersion', kind: 'text' },
  ],
  Dataset: [
    { key: 'url', kind: 'url' },
    { key: 'description', kind: 'longtext' },
  ],
  MediaObject: [
    { key: 'encodingFormat', kind: 'text' },
    { key: 'contentUrl', kind: 'url' },
  ],
  Place: [
    { key: 'address', kind: 'text' },
    { key: 'url', kind: 'url' },
  ],
  Event: [
    { key: 'startDate', kind: 'date' },
    { key: 'endDate', kind: 'date' },
    { key: 'location', kind: 'reference' },
  ],
  DefinedTerm: [
    { key: 'termCode', kind: 'text' },
    { key: 'url', kind: 'url' },
  ],
  Taxon: [
    { key: 'taxonRank', kind: 'text' },
    { key: 'url', kind: 'url' },
  ],
}

function entriesFor(vocab: VocabIndex | null, type: string): ReadonlyArray<DefaultProperty> {
  if (!vocab) return BY_TYPE[typeLabel(type)] ?? []
  for (const uri of vocab.classAncestors(vocabTypeUri(type))) {
    const entries = BY_TYPE[typeLabel(uri)]
    if (entries) return entries
  }
  return []
}

function known(vocab: VocabIndex, entry: DefaultProperty): DefaultProperty | undefined {
  if (!propertyTerm(vocab, entry.key)) return undefined
  const kinds = allowedKinds(vocab, entry.key)
  const kind = kinds.includes(entry.kind) ? entry.kind : kinds[0]
  return kind ? { key: entry.key, kind } : undefined
}

/** The properties a new entity of this type starts with, vocabulary permitting. */
export function defaultProperties(vocab: VocabIndex | null, type: string): DefaultProperty[] {
  const entries = entriesFor(vocab, type)
  if (!vocab) return entries.map((entry) => ({ ...entry }))
  return entries.flatMap((entry) => known(vocab, entry) ?? [])
}

/** The same properties as empty rows, ready to hand to addEntity. */
export function defaultRows(vocab: VocabIndex | null, type: string): Record<string, DraftValue[]> {
  return Object.fromEntries(defaultProperties(vocab, type)
    .map((entry) => [entry.key, [defaultValue(entry.kind)]]))
}
