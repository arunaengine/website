// The made-up profile the profile tutorial writes and then applies: one Root
// dataset shape, one Person shape, and the SHACL those rules project to. The
// crate below carries that SHACL and nothing else, so the editor lifts its
// rules exactly as it would for a profile someone authored in SHACL.
import type { MetadataDocumentListItem } from '@/lib/api'
import type { ProfileEntityRule } from '@/lib/profiles/types'
import {
  DX_HAS_ARTIFACT,
  DX_HAS_RESOURCE,
  DX_HAS_ROLE,
  DX_PROFILE,
  DX_RESOURCE_DESCRIPTOR,
  DX_ROLE_CONSTRAINTS,
  RO_CRATE_CONTEXT,
  RO_CRATE_PROFILE,
  SHACL_NS,
} from '@/lib/profiles/types'
import { shapesFromEntityRules } from '@/lib/shacl/projection'

const SCHEMA = 'http://schema.org/'

export const TUTORIAL_PROFILE_SLUG = 'station-survey'
export const TUTORIAL_PROFILE_DOC_ID = '01TUTORIALPROFILE00000000'
export const TUTORIAL_PROFILE_PATH = `profiles/${TUTORIAL_PROFILE_SLUG}`
export const TUTORIAL_DATASET_DOC_ID = '01TUTORIALDATASET00000000'

export const TUTORIAL_PROFILE_BASICS = {
  slug: TUTORIAL_PROFILE_SLUG,
  name: 'Station survey dataset',
  description: 'What a survey of station readings must carry before it is published.',
  version: '0.1.0',
  datePublished: '2026-01-15',
  license: 'https://creativecommons.org/licenses/by/4.0/',
}

/** The Person the root must name; the rule that pulls the shared shape in. */
export const TUTORIAL_PROFILE_RULES: ProfileEntityRule[] = [
  {
    id: 'dataset',
    label: 'Root dataset',
    description: 'The survey itself.',
    type: `${SCHEMA}Dataset`,
    className: 'Dataset',
    propertyRules: [
      {
        id: 'name',
        label: 'Name',
        description: 'What this survey is called.',
        kind: 'text',
        propertyUri: `${SCHEMA}name`,
        valueName: 'name',
        obligation: 'MUST',
      },
      {
        id: 'description',
        label: 'Description',
        description: 'What was measured, where, and how.',
        kind: 'longtext',
        propertyUri: `${SCHEMA}description`,
        valueName: 'description',
        obligation: 'MUST',
      },
      {
        id: 'date-published',
        label: 'Date published',
        description: 'The day the survey was released.',
        kind: 'date',
        propertyUri: `${SCHEMA}datePublished`,
        valueName: 'datePublished',
        obligation: 'MUST',
      },
      {
        id: 'license',
        label: 'License',
        description: 'The terms the readings may be reused under.',
        kind: 'url',
        propertyUri: `${SCHEMA}license`,
        valueName: 'license',
        obligation: 'MUST',
      },
      {
        id: 'creator',
        label: 'Creator',
        description: 'Who ran the survey.',
        kind: 'entity',
        propertyUri: `${SCHEMA}creator`,
        valueName: 'creator',
        obligation: 'MUST',
        entityTypes: [`${SCHEMA}Person`],
      },
    ],
  },
  {
    id: 'person',
    label: 'Person',
    description: 'Someone named by the survey.',
    type: `${SCHEMA}Person`,
    className: 'Person',
    propertyRules: [
      {
        id: 'name',
        label: 'Name',
        description: 'The name this person is credited under.',
        kind: 'text',
        propertyUri: `${SCHEMA}name`,
        valueName: 'name',
        obligation: 'MUST',
      },
      {
        id: 'affiliation',
        label: 'Affiliation',
        description: 'Where they work.',
        kind: 'text',
        propertyUri: `${SCHEMA}affiliation`,
        valueName: 'affiliation',
        obligation: 'MAY',
      },
    ],
  },
]

/** Real SHACL, projected from the rules above rather than written twice. */
export const TUTORIAL_PROFILE_SHAPES = shapesFromEntityRules(TUTORIAL_PROFILE_BASICS, TUTORIAL_PROFILE_RULES)

/** What the tutorial's check insists on, in the order the panel reads them. */
export const TUTORIAL_REQUIRED_ROOT = ['name', 'description', 'datePublished', 'license', 'creator']
export const TUTORIAL_REQUIRED_PERSON = ['name']

const SHAPES_ID = 'shapes.ttl'

/**
 * A SHACL-only profile crate: no mode file and no schema, so the rules exist
 * only once the shapes are lifted, which is the path a profile imported from
 * SHACL takes.
 */
export function tutorialProfileCrate(): Record<string, unknown> {
  return {
    '@context': RO_CRATE_CONTEXT,
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': RO_CRATE_PROFILE },
        about: { '@id': './' },
      },
      {
        '@id': './',
        '@type': ['Dataset', DX_PROFILE],
        name: TUTORIAL_PROFILE_BASICS.name,
        description: TUTORIAL_PROFILE_BASICS.description,
        version: TUTORIAL_PROFILE_BASICS.version,
        datePublished: TUTORIAL_PROFILE_BASICS.datePublished,
        license: { '@id': TUTORIAL_PROFILE_BASICS.license },
        isProfileOf: { '@id': RO_CRATE_PROFILE },
        hasPart: [{ '@id': SHAPES_ID }],
        [DX_HAS_RESOURCE]: [{ '@id': '#shapes-resource' }],
      },
      {
        '@id': SHAPES_ID,
        '@type': 'File',
        name: `${TUTORIAL_PROFILE_BASICS.name} SHACL Shapes`,
        encodingFormat: 'text/turtle',
        conformsTo: { '@id': SHACL_NS },
        text: TUTORIAL_PROFILE_SHAPES,
      },
      {
        '@id': '#shapes-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_CONSTRAINTS },
        [DX_HAS_ARTIFACT]: { '@id': SHAPES_ID },
      },
    ],
  }
}

// The tutorial works in the reader's own group, so the practice profile is one
// its datasets may declare; nothing about either ever reaches a node.
export function tutorialProfileItem(groupId: string): MetadataDocumentListItem {
  return {
    document_id: TUTORIAL_PROFILE_DOC_ID,
    group_id: groupId,
    document_path: TUTORIAL_PROFILE_PATH,
    graph_iri: `https://tutorial.invalid/graph/${TUTORIAL_PROFILE_DOC_ID}`,
    public: false,
    replicas: 1,
    created_at: '2026-01-15T09:00:00Z',
    updated_at: '2026-01-15T09:00:00Z',
    rocrate_summary: tutorialProfileCrate(),
  }
}

/** The row a simulated dataset save answers with. */
export function tutorialDatasetItem(groupId: string, path: string): MetadataDocumentListItem {
  return {
    document_id: TUTORIAL_DATASET_DOC_ID,
    group_id: groupId,
    document_path: path || 'datasets/station-survey',
    graph_iri: `https://tutorial.invalid/graph/${TUTORIAL_DATASET_DOC_ID}`,
    public: false,
    replicas: 1,
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-01-15T09:30:00Z',
  }
}
