import { buildProfileCrate } from './rocrate'
import { schemaFromEntityRules } from './schema'
import { entityRulesToMode } from './mode'
import type { ProfileBasics, ProfileEntityRule } from './types'
import type { MetadataProfile } from '@/data/types'

// Built-in, read-only "Workflow Run Crate" profile, bundled statically so every
// node offers it by default. It describes the run crates the portal itself
// writes for finished jobs (lib/runCrate.ts): a Dataset root that `mentions` a
// CreateAction with agent / instrument / object / result. The conformance URIs
// are the official Workflow Run RO-Crate profiles (verified to resolve via
// w3id.org): https://w3id.org/ro/wfrun/{process,workflow,provenance}/0.5.
export const WORKFLOW_RUN_PROFILE_URIS = [
  'https://w3id.org/ro/wfrun/process/0.5',
  'https://w3id.org/ro/wfrun/workflow/0.5',
  'https://w3id.org/ro/wfrun/provenance/0.5',
] as const

export const WORKFLOW_RUN_CRATE_PROFILE_ID = 'workflow-run-crate'

const SCHEMA = 'http://schema.org/'

const BASICS: ProfileBasics = {
  slug: WORKFLOW_RUN_CRATE_PROFILE_ID,
  name: 'Workflow Run Crate',
  description:
    'Describes a computational run: which action produced the data, who ran it, with what tool, and which files went in and out. Follows the Workflow Run RO-Crate profiles (w3id.org/ro/wfrun) — the same shape the portal writes for finished compute jobs.',
  version: '0.5.0',
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
      { id: 'description', label: 'Description', description: 'Plain-language summary of what was run.', kind: 'longtext', propertyUri: `${SCHEMA}description`, valueName: 'description', obligation: 'MUST' },
      { id: 'date-published', label: 'Date published', description: 'Publication date in ISO date format.', kind: 'date', propertyUri: `${SCHEMA}datePublished`, valueName: 'datePublished', obligation: 'MUST' },
      { id: 'license', label: 'License', description: 'License URL.', kind: 'url', propertyUri: `${SCHEMA}license`, valueName: 'license', obligation: 'MUST', example: 'https://creativecommons.org/licenses/by/4.0/' },
      {
        id: 'mentions',
        label: 'Workflow run',
        description: 'The action that carried out the run — the crate root mentions it.',
        kind: 'entity',
        propertyUri: `${SCHEMA}mentions`,
        valueName: 'mentions',
        obligation: 'MUST',
        multipleValues: true,
        entityTypes: [`${SCHEMA}CreateAction`],
      },
    ],
  },
  {
    id: 'run-action',
    label: 'Run action',
    description: 'The CreateAction that executed the workflow or process.',
    type: `${SCHEMA}CreateAction`,
    className: 'CreateAction',
    propertyRules: [
      { id: 'name', label: 'Name', description: 'What the run did.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'SHOULD' },
      { id: 'start-time', label: 'Start time', description: 'When the run started.', kind: 'datetime', propertyUri: `${SCHEMA}startTime`, valueName: 'startTime', obligation: 'SHOULD' },
      { id: 'end-time', label: 'End time', description: 'When the run finished.', kind: 'datetime', propertyUri: `${SCHEMA}endTime`, valueName: 'endTime', obligation: 'SHOULD' },
      {
        id: 'action-status',
        label: 'Status',
        description: 'Whether the run completed or failed.',
        kind: 'enum',
        propertyUri: `${SCHEMA}actionStatus`,
        valueName: 'actionStatus',
        obligation: 'SHOULD',
        enumOptions: [`${SCHEMA}CompletedActionStatus`, `${SCHEMA}FailedActionStatus`],
      },
      { id: 'instrument', label: 'Instrument', description: 'The tool that performed the run, e.g. a container image or workflow engine.', kind: 'text', propertyUri: `${SCHEMA}instrument`, valueName: 'instrument', obligation: 'SHOULD', example: 'python:3.12-slim' },
      { id: 'agent', label: 'Agent', description: 'The person (or organization) that initiated the run.', kind: 'entity', propertyUri: `${SCHEMA}agent`, valueName: 'agent', obligation: 'SHOULD', entityTypes: [`${SCHEMA}Person`] },
      { id: 'object', label: 'Inputs', description: 'Files consumed by the run.', kind: 'entity', propertyUri: `${SCHEMA}object`, valueName: 'object', obligation: 'MAY', multipleValues: true, entityTypes: [`${SCHEMA}MediaObject`] },
      { id: 'result', label: 'Outputs', description: 'Files produced by the run.', kind: 'entity', propertyUri: `${SCHEMA}result`, valueName: 'result', obligation: 'MAY', multipleValues: true, entityTypes: [`${SCHEMA}MediaObject`] },
      { id: 'error', label: 'Error', description: 'Error output when the run failed.', kind: 'longtext', propertyUri: `${SCHEMA}error`, valueName: 'error', obligation: 'MAY' },
    ],
  },
  {
    id: 'person',
    label: 'Person',
    description: 'The person who ran the workflow.',
    type: `${SCHEMA}Person`,
    className: 'Person',
    propertyRules: [
      { id: 'name', label: 'Name', description: 'Display name.', kind: 'text', propertyUri: `${SCHEMA}name`, valueName: 'name', obligation: 'MUST' },
      { id: 'identifier', label: 'Identifier', description: 'Persistent identifier such as an ORCID.', kind: 'url', propertyUri: `${SCHEMA}identifier`, valueName: 'identifier', obligation: 'SHOULD' },
    ],
  },
]

// The complete bundled profile crate (artifacts embedded inline), for display
// and download parity with stored profiles.
export const WORKFLOW_RUN_CRATE_PROFILE_CRATE: Record<string, unknown> = buildProfileCrate({
  ...BASICS,
  entityRules: ENTITY_RULES,
})

export const WORKFLOW_RUN_CRATE_PROFILE: MetadataProfile = {
  id: WORKFLOW_RUN_CRATE_PROFILE_ID,
  // No documentId/documentPath: the profile is bundled, not stored on the node.
  profileUri: WORKFLOW_RUN_PROFILE_URIS[0],
  graphIri: WORKFLOW_RUN_PROFILE_URIS[0],
  name: BASICS.name,
  shortName: 'Workflow',
  description: BASICS.description,
  domain: 'RO-Crate Profile',
  version: BASICS.version,
  iconColor: '#335DC6',
  entityRules: ENTITY_RULES,
  propertyRules: ENTITY_RULES[0].propertyRules,
  schema: schemaFromEntityRules(BASICS, ENTITY_RULES),
  mode: entityRulesToMode(BASICS, ENTITY_RULES),
  suggestedKeywords: ['workflow', 'provenance', 'run'],
  managed: true,
  builtIn: true,
  usedCount: 0,
}

// True when a document's conformance ids mark it as a workflow/process run
// crate (any wfrun profile version, or the bundled profile itself).
export function conformsToWorkflowRun(ids: readonly string[] | undefined): boolean {
  return (ids ?? []).some(
    (id) => id.startsWith('https://w3id.org/ro/wfrun/') || id === WORKFLOW_RUN_CRATE_PROFILE_ID,
  )
}
