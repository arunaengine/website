import { buildProfileCrate } from './rocrate'
import { schemaFromEntityRules } from './schema'
import { entityRulesToMode } from './mode'
import { shapesFromEntityRules } from '../shacl/projection'
import type { ProfileBasics, ProfileEntityRule } from './types'
import type { MetadataProfile } from '@/data/types'

// Bundled, read-only Process Run Crate profile for the crates Aruna writes
// after finished compute jobs.
export const PROCESS_RUN_PROFILE_URI = 'https://w3id.org/ro/wfrun/process/0.5'

export const PROCESS_RUN_CRATE_PROFILE_ID = 'process-run-crate'

const SCHEMA = 'http://schema.org/'
const WFRUN = 'https://w3id.org/ro/terms/workflow-run#'

const BASICS: ProfileBasics = {
  slug: PROCESS_RUN_CRATE_PROFILE_ID,
  name: 'Process Run Crate',
  description:
    'Describes a computational process run: which action produced the data, who ran it, with what tool, and which files went in and out. Follows the Process Run Crate 0.5 profile.',
  version: '0.5',
  // Fixed date: the bundled profile is versioned content, not a live document.
  datePublished: '2025-11-07',
  license: 'https://creativecommons.org/licenses/by/4.0/',
}

const ENTITY_RULES: ProfileEntityRule[] = [
  {
    id: 'dataset',
    label: 'Root Dataset',
    description: 'The root RO-Crate dataset entity describing the run and its files.',
    type: `${SCHEMA}Dataset`,
    className: 'Dataset',
    propertyRules: [
      { id: 'name', label: 'Name', description: 'Human readable title of the run.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'MUST' },
      { id: 'description', label: 'Description', description: 'Plain-language summary of what was run.', kind: 'longtext', propertyUri: `${SCHEMA}description`, valueName: 'description', obligation: 'MAY' },
      { id: 'date-published', label: 'Date published', description: 'Publication date in ISO date format.', kind: 'date', propertyUri: `${SCHEMA}datePublished`, valueName: 'datePublished', obligation: 'MAY' },
      { id: 'license', label: 'License', description: 'License URL.', kind: 'url', propertyUri: `${SCHEMA}license`, valueName: 'license', obligation: 'MAY', example: 'https://creativecommons.org/licenses/by/4.0/' },
      {
        id: 'mentions',
        label: 'Process run',
        description: 'The action that carried out the run, the crate root mentions it.',
        kind: 'entity',
        propertyUri: `${SCHEMA}mentions`,
        valueName: 'mentions',
        obligation: 'SHOULD',
        multipleValues: true,
        entityTypes: [`${SCHEMA}CreateAction`],
      },
    ],
  },
  {
    id: 'run-action',
    label: 'Run action',
    description: 'The CreateAction that executed the process.',
    type: `${SCHEMA}CreateAction`,
    className: 'CreateAction',
    propertyRules: [
      { id: 'name', label: 'Name', description: 'What the run did.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'SHOULD' },
      { id: 'description', label: 'Command', description: 'The complete command executed by the process.', kind: 'longtext', propertyUri: `${SCHEMA}description`, valueName: 'description', obligation: 'SHOULD' },
      { id: 'start-time', label: 'Start time', description: 'When the run started.', kind: 'datetime', propertyUri: `${SCHEMA}startTime`, valueName: 'startTime', obligation: 'MAY' },
      { id: 'end-time', label: 'End time', description: 'When the run finished.', kind: 'datetime', propertyUri: `${SCHEMA}endTime`, valueName: 'endTime', obligation: 'SHOULD' },
      {
        id: 'action-status',
        label: 'Status',
        description: 'Whether the run completed or failed.',
        kind: 'enum',
        propertyUri: `${SCHEMA}actionStatus`,
        valueName: 'actionStatus',
        obligation: 'MAY',
        enumOptions: [`${SCHEMA}CompletedActionStatus`, `${SCHEMA}FailedActionStatus`],
      },
      { id: 'instrument', label: 'Instrument', description: 'The software application that performed the run.', kind: 'entity', propertyUri: `${SCHEMA}instrument`, valueName: 'instrument', obligation: 'MUST', entityTypes: [`${SCHEMA}SoftwareApplication`] },
      { id: 'container-image', label: 'Container image', description: 'The container image used by the run.', kind: 'entity', propertyUri: `${WFRUN}containerImage`, valueName: 'containerImage', obligation: 'MAY', entityTypes: [`${WFRUN}ContainerImage`] },
      { id: 'agent', label: 'Agent', description: 'The person (or organization) that initiated the run.', kind: 'entity', propertyUri: `${SCHEMA}agent`, valueName: 'agent', obligation: 'SHOULD', entityTypes: [`${SCHEMA}Person`] },
      { id: 'object', label: 'Inputs', description: 'Files consumed by the run.', kind: 'entity', propertyUri: `${SCHEMA}object`, valueName: 'object', obligation: 'MAY', multipleValues: true, entityTypes: [`${SCHEMA}MediaObject`] },
      { id: 'result', label: 'Outputs', description: 'Files produced by the run.', kind: 'entity', propertyUri: `${SCHEMA}result`, valueName: 'result', obligation: 'SHOULD', multipleValues: true, entityTypes: [`${SCHEMA}MediaObject`] },
      { id: 'error', label: 'Error', description: 'Error output when the run failed.', kind: 'longtext', propertyUri: `${SCHEMA}error`, valueName: 'error', obligation: 'MAY' },
    ],
  },
  {
    id: 'person',
    label: 'Person',
    description: 'The person who ran the process.',
    type: `${SCHEMA}Person`,
    className: 'Person',
    propertyRules: [
      { id: 'name', label: 'Name', description: 'Display name.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'MAY' },
      { id: 'identifier', label: 'Identifier', description: 'Persistent user identifier.', kind: 'text', propertyUri: `${SCHEMA}identifier`, valueName: 'identifier', obligation: 'MAY' },
    ],
  },
  {
    id: 'software',
    label: 'Software application',
    description: 'The software application that performed the process.',
    type: `${SCHEMA}SoftwareApplication`,
    className: 'SoftwareApplication',
    propertyRules: [
      { id: 'name', label: 'Name', description: 'Application name.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'SHOULD' },
      { id: 'identifier', label: 'Identifier', description: 'Application or image identifier.', kind: 'text', propertyUri: `${SCHEMA}identifier`, valueName: 'identifier', obligation: 'MAY' },
      { id: 'version', label: 'Version', description: 'Application version.', kind: 'text', propertyUri: `${SCHEMA}softwareVersion`, valueName: 'softwareVersion', obligation: 'SHOULD' },
      { id: 'url', label: 'Application link', description: 'Human-facing application URL.', kind: 'url', propertyUri: `${SCHEMA}url`, valueName: 'url', obligation: 'SHOULD' },
    ],
  },
  {
    id: 'container-image',
    label: 'Container image',
    description: 'The container image used to execute the process.',
    type: `${WFRUN}ContainerImage`,
    className: 'ContainerImage',
    propertyRules: [
      { id: 'additional-type', label: 'Image type', description: 'Container image format.', kind: 'url', propertyUri: `${SCHEMA}additionalType`, valueName: 'additionalType', obligation: 'SHOULD', example: `${WFRUN}DockerImage` },
      { id: 'identifier', label: 'Pinned reference', description: 'Digest-pinned image reference.', kind: 'text', propertyUri: `${SCHEMA}identifier`, valueName: 'identifier', obligation: 'SHOULD' },
      { id: 'registry', label: 'Registry', description: 'Container registry host.', kind: 'text', propertyUri: `${WFRUN}registry`, valueName: 'registry', obligation: 'SHOULD' },
      { id: 'name', label: 'Image name', description: 'Repository name within the registry.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'SHOULD' },
      { id: 'tag', label: 'Tag', description: 'Submitted image tag.', kind: 'text', propertyUri: `${WFRUN}tag`, valueName: 'tag', obligation: 'MAY' },
      { id: 'sha256', label: 'Digest', description: 'Pinned SHA-256 digest.', kind: 'text', propertyUri: `${WFRUN}sha256`, valueName: 'sha256', obligation: 'MAY' },
      { id: 'url', label: 'Registry link', description: 'Human-facing image URL.', kind: 'url', propertyUri: `${SCHEMA}url`, valueName: 'url', obligation: 'MAY' },
    ],
  },
]

// The complete bundled profile crate (artifacts embedded inline), for display
// and download parity with stored profiles.
export const PROCESS_RUN_CRATE_PROFILE_CRATE: Record<string, unknown> = buildProfileCrate({
  ...BASICS,
  entityRules: ENTITY_RULES,
})

export const PROCESS_RUN_CRATE_PROFILE: MetadataProfile = {
  id: PROCESS_RUN_CRATE_PROFILE_ID,
  // No documentId/documentPath: the profile is bundled, not stored on the node.
  profileUri: PROCESS_RUN_PROFILE_URI,
  graphIri: PROCESS_RUN_PROFILE_URI,
  name: BASICS.name,
  shortName: 'Process run',
  description: BASICS.description,
  domain: 'RO-Crate Profile',
  version: BASICS.version,
  iconColor: '#335DC6',
  entityRules: ENTITY_RULES,
  propertyRules: ENTITY_RULES[0].propertyRules,
  schema: schemaFromEntityRules(BASICS, ENTITY_RULES),
  mode: entityRulesToMode(BASICS, ENTITY_RULES),
  shapesText: shapesFromEntityRules(BASICS, ENTITY_RULES),
  suggestedKeywords: ['process', 'provenance', 'run'],
  managed: true,
  builtIn: true,
  usedCount: 0,
}

// Match the full profile IRI; conformsTo ordering carries no meaning.
export function conformsToProcessRun(ids: readonly string[] | undefined): boolean {
  return (ids ?? []).some((id) => id === PROCESS_RUN_PROFILE_URI)
}
