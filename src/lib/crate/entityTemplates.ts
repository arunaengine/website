import { orcidOf, rorOf } from '@/lib/identifiers'
import {
  CURATED_PROPERTY_TERMS,
  propertyTermsForType,
  type PropertyTermOption,
} from '@/lib/profiles/propertyCatalog'
import { slugify } from '@/lib/profiles/emit'
import type { ContextEntity, RootRole } from './build'

export type EntityTemplateFieldKind = 'text' | 'url' | 'date' | 'number' | 'email' | 'reference' | 'term'

export interface EntityTemplateField {
  property: string
  label: string
  kind: EntityTemplateFieldKind
  required?: boolean
  propertyUri: string
}

export interface EntityTemplate {
  id: string
  label: string
  description: string
  type: string
  typeUri: string
  roles: RootRole[]
  fields: EntityTemplateField[]
  create: (values: Record<string, unknown>, role?: RootRole) => ContextEntity
}

const SCHEMA = 'http://schema.org/'

function propertyField(
  typeUri: string,
  property: string,
  kind: EntityTemplateFieldKind,
  required = false,
): EntityTemplateField {
  const term = [...propertyTermsForType(typeUri), ...CURATED_PROPERTY_TERMS]
    .find((candidate) => candidate.name === property)
  return {
    property,
    label: term?.label ?? property,
    kind,
    required: required || undefined,
    propertyUri: term?.uri ?? `${SCHEMA}${property}`,
  }
}

function stringValue(values: Record<string, unknown>, key: string): string {
  return typeof values[key] === 'string' ? values[key].trim() : ''
}

function derivedId(values: Record<string, unknown>, prefix: string): string {
  const explicit = stringValue(values, 'id') || stringValue(values, '@id')
  if (explicit) return explicit
  return `#${prefix}-${slugify(stringValue(values, 'name')) || 'untitled'}`
}

function selectedRole(templateRoles: RootRole[], role?: RootRole): RootRole {
  return role && templateRoles.includes(role) ? role : templateRoles[0]
}

function propertiesFromFields(
  fields: EntityTemplateField[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const field of fields) {
    const value = values[field.property]
    if (value === undefined || value === null || value === '') continue
    properties[field.property] = field.kind === 'reference' && typeof value === 'string'
      ? { '@id': value }
      : value
  }
  return properties
}

function template(config: Omit<EntityTemplate, 'create'> & {
  idFor?: (values: Record<string, unknown>) => string
}): EntityTemplate {
  return {
    ...config,
    create(values, role) {
      return {
        id: config.idFor?.(values) ?? derivedId(values, config.id),
        type: config.type,
        properties: propertiesFromFields(config.fields, values),
        roles: [selectedRole(config.roles, role)],
      }
    },
  }
}

const DEFAULT_PROPERTIES = ['name', 'description', 'url', 'identifier']

/** Maps a catalogue or vocabulary value kind onto a form field kind. */
export function fieldKindOf(kind?: string): EntityTemplateFieldKind {
  if (kind === 'url' || kind === 'email' || kind === 'date' || kind === 'number') return kind
  if (kind === 'entity') return 'reference'
  return 'text'
}

// What an entity of any type starts with: the four properties every crate
// reader understands, plus the two most useful curated ones for that type.
export function defaultFieldsForType(typeUri: string): EntityTemplateField[] {
  const shown = new Set(DEFAULT_PROPERTIES)
  return [
    ...DEFAULT_PROPERTIES.map((property) =>
      propertyField(typeUri, property, property === 'url' ? 'url' : 'text', property === 'name')),
    ...propertyTermsForType(typeUri)
      .filter((term) => !shown.has(term.name))
      .slice(0, 2)
      .map((term) => propertyField(typeUri, term.name, fieldKindOf(term.suggestedKind))),
  ]
}

const personType = `${SCHEMA}Person`
const organizationType = `${SCHEMA}Organization`
const publicationType = `${SCHEMA}ScholarlyArticle`
const softwareType = `${SCHEMA}SoftwareSourceCode`
const placeType = `${SCHEMA}Place`
const eventType = `${SCHEMA}Event`
const contactType = `${SCHEMA}ContactPoint`
const termType = `${SCHEMA}DefinedTerm`

export const ENTITY_TEMPLATES: EntityTemplate[] = [
  template({
    id: 'person',
    label: 'Person',
    description: 'A person responsible for or contributing to the dataset.',
    type: 'Person',
    typeUri: personType,
    roles: ['author', 'contributor', 'maintainer'],
    fields: [
      propertyField(personType, 'givenName', 'text'),
      propertyField(personType, 'familyName', 'text'),
      propertyField(personType, 'name', 'text', true),
      propertyField(personType, 'affiliation', 'reference'),
    ],
    idFor(values) {
      const orcid = orcidOf(stringValue(values, 'orcid'))
      return orcid ? `https://orcid.org/${orcid}` : derivedId(values, 'person')
    },
  }),
  template({
    id: 'organization',
    label: 'Organization',
    description: 'An institution, publisher, funder, or affiliation.',
    type: 'Organization',
    typeUri: organizationType,
    roles: ['publisher', 'funder', 'affiliation'],
    fields: [
      propertyField(organizationType, 'name', 'text', true),
      propertyField(organizationType, 'url', 'url'),
    ],
    idFor(values) {
      const ror = rorOf(stringValue(values, 'ror'))
      return ror ? `https://ror.org/${ror}` : derivedId(values, 'org')
    },
  }),
  template({
    id: 'publication',
    label: 'Publication',
    description: 'A scholarly publication cited by the dataset.',
    type: 'ScholarlyArticle',
    typeUri: publicationType,
    roles: ['citation'],
    fields: [propertyField(publicationType, 'name', 'text', true)],
    idFor(values) {
      const doi = stringValue(values, 'doi').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      return doi ? `https://doi.org/${doi}` : derivedId(values, 'pub')
    },
  }),
  template({
    id: 'software',
    label: 'Software',
    description: 'Source code or software used by the dataset.',
    type: 'SoftwareSourceCode',
    typeUri: softwareType,
    roles: ['about'],
    fields: [
      propertyField(softwareType, 'name', 'text', true),
      propertyField(softwareType, 'url', 'url'),
      propertyField(softwareType, 'version', 'text'),
    ],
  }),
  template({
    id: 'place',
    label: 'Place',
    description: 'A location covered by the dataset.',
    type: 'Place',
    typeUri: placeType,
    roles: ['spatialCoverage'],
    fields: [
      propertyField(placeType, 'name', 'text', true),
      propertyField(placeType, 'latitude', 'number'),
      propertyField(placeType, 'longitude', 'number'),
    ],
  }),
  template({
    id: 'event',
    label: 'Event',
    description: 'An event associated with the dataset.',
    type: 'Event',
    typeUri: eventType,
    roles: ['about'],
    fields: [
      propertyField(eventType, 'name', 'text', true),
      propertyField(eventType, 'startDate', 'date'),
      propertyField(eventType, 'endDate', 'date'),
    ],
  }),
  template({
    id: 'contact',
    label: 'Contact point',
    description: 'A contact for questions about the dataset.',
    type: 'ContactPoint',
    typeUri: contactType,
    roles: ['contactPoint'],
    fields: [
      propertyField(contactType, 'name', 'text', true),
      propertyField(contactType, 'email', 'email'),
    ],
  }),
  template({
    id: 'term',
    label: 'Term',
    description: 'A controlled term supplied by a terminology provider.',
    type: 'DefinedTerm',
    typeUri: termType,
    roles: ['about', 'keywords'],
    fields: [propertyField(termType, 'name', 'term', true)],
  }),
  template({
    id: 'other',
    label: 'Something else',
    description: 'Any other schema.org or Dublin Core type.',
    type: 'Thing',
    typeUri: `${SCHEMA}Thing`,
    roles: ['about'],
    fields: defaultFieldsForType(`${SCHEMA}Thing`),
    idFor: (values) => derivedId(values, 'entity'),
  }),
]

const ROLE_TEMPLATES: Record<string, string> = {
  author: 'person',
  contributor: 'person',
  maintainer: 'person',
  publisher: 'organization',
  funder: 'organization',
  affiliation: 'organization',
  citation: 'publication',
  contactPoint: 'contact',
  spatialCoverage: 'place',
}

/** The template a root reference field opens for its role. */
export function templateForRole(role: RootRole): EntityTemplate | undefined {
  const id = ROLE_TEMPLATES[String(role)]
  return id ? ENTITY_TEMPLATES.find((template) => template.id === id) : undefined
}

export function createOtherEntity(
  typeUri: string,
  values: Record<string, unknown>,
  role: RootRole = 'about',
): ContextEntity {
  return {
    id: derivedId(values, 'entity'),
    type: typeUri.split('/').pop() || typeUri,
    properties: propertiesFromFields(defaultFieldsForType(typeUri), values),
    roles: [role],
  }
}

export function propertySuggestionsForType(typeUri: string): PropertyTermOption[] {
  return propertyTermsForType(typeUri)
}

/** Extra properties a form added beyond its template, merged onto the entity. */
export function applyFields(
  entity: ContextEntity,
  fields: EntityTemplateField[],
  values: Record<string, unknown>,
): ContextEntity {
  if (!fields.length) return entity
  return { ...entity, properties: { ...entity.properties, ...propertiesFromFields(fields, values) } }
}
