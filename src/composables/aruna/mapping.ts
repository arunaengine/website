import { computed } from 'vue'
import type { MetadataDoc, MetadataProfile } from '@/data/types'
import type { MetadataDocumentListItem } from '@/lib/api'
import { parseProfileCrate } from '@/lib/profiles/rocrate'
import { classifyRoCrateSpecIri } from '@/lib/rocrateVersions'
import {
  PROCESS_RUN_CRATE_PROFILE,
  PROCESS_RUN_CRATE_PROFILE_ID,
  PROCESS_RUN_PROFILE_URI,
} from '@/lib/profiles/builtinProfiles'
import { arrayText, idValue, idValues, people, primaryEntity, textValue, typeList } from './crateFields'
import { colorFor } from './format'
import { profileIdFromPath, profileIdsFromConformsTo, publicProfileIri } from './profileIri'
import { fullCrates, metadataItems, profileCrateParses, profileItems } from './state'

// Stored profiles plus the bundled Process Run profile. Its id is reserved so
// exact Process Run conformance always resolves to the bundled definition.
export const profiles = computed<MetadataProfile[]>(() => {
  const stored = profileItems.value.map(mapProfile).filter((profile) => profile.id !== PROCESS_RUN_CRATE_PROFILE.id)
  return [...stored, PROCESS_RUN_CRATE_PROFILE]
})
export const metadata = computed<MetadataDoc[]>(() => metadataItems.value.map(mapMetadataDoc))

export function mapMetadataDoc(item: MetadataDocumentListItem): MetadataDoc {
  const entity = primaryEntity(item.rocrate_summary)
  const title = textValue(entity?.name) || textValue(entity?.title) || item.document_path || item.document_id
  const description = textValue(entity?.description) || ''
  const keywords = arrayText(entity?.keywords ?? entity?.keyword)
  const license = idValue(entity?.license) || textValue(entity?.license) || ''
  const contributors = people(entity?.author ?? entity?.creator ?? entity?.contributor)
  // Keep the raw conformance ids so the UI can show an external profile IRI even when it
  // resolves to no local profile. Drop the RO-Crate spec conformance URI, which is not a profile.
  const conformsToIds = idValues(entity?.conformsTo).filter(
    (id) => classifyRoCrateSpecIri(id).kind === 'non-spec',
  )
  const profileIds = profileIdsFromConformsTo(entity?.conformsTo)
  let profileId = ''
  if (conformsToIds.includes(PROCESS_RUN_PROFILE_URI)) profileId = PROCESS_RUN_CRATE_PROFILE_ID
  else if (profileIds.length === 1) for (const resolvedId of profileIds) profileId = resolvedId
  return {
    ulid: item.document_id,
    title,
    description,
    type: arrayText(entity?.['@type']).join(', ') || 'Dataset',
    license,
    keywords,
    currentVersion: 1,
    versions: [
      {
        version: 1,
        versionVector: item.graph_iri,
        createdAt: item.created_at,
        author: contributors[0]?.name ?? '',
        changelog: 'Stored in Aruna.',
        hash: item.document_id,
      },
    ],
    linkedObjects: [],
    primaryBucketId: '',
    realmId: item.group_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    author: contributors[0]?.name ?? '',
    organization: contributors[0]?.affiliation ?? '',
    nodeId: '',
    profileId,
    profileIds,
    conformsToIds,
    contributors,
    doi: idValue(entity?.identifier) || textValue(entity?.identifier),
    temporalCoverage: textValue(entity?.temporalCoverage),
    spatialCoverage: textValue(entity?.spatialCoverage),
    language: textValue(entity?.inLanguage),
    roCrate: fullCrates.value[item.document_id] ?? item.rocrate_summary ?? {},
  }
}

export function mapProfile(item: MetadataDocumentListItem): MetadataProfile {
  const rocrate = fullCrates.value[item.document_id] ?? item.rocrate_summary
  let parsed: ReturnType<typeof parseProfileCrate>
  try {
    parsed = profileCrateParses.value[item.document_id] ?? parseProfileCrate(rocrate)
  } catch {
    // A malformed stored profile crate must never throw the whole `profiles`
    // computed; surface it with no machine-readable rules instead.
    parsed = { name: '', description: '', entityRules: [], datasetPropertyRules: [] }
  }
  const pathId = profileIdFromPath(item.document_path) || item.document_id
  const entity = primaryEntity(rocrate)
  const name = parsed.name || textValue(entity?.name) || pathId
  return {
    id: pathId,
    documentId: item.document_id,
    documentPath: item.document_path,
    graphIri: item.graph_iri,
    profileUri: publicProfileIri(item.document_id),
    name,
    shortName: name.split(/\s+/)[0] || pathId,
    description: parsed.description || textValue(entity?.description) || '',
    domain: typeList(entity).includes('http://www.w3.org/ns/dx/prof/Profile') ? 'RO-Crate Profile' : textValue(entity?.domain) || 'RO-Crate',
    version: parsed.version,
    iconColor: colorFor(pathId),
    entityRules: parsed.entityRules,
    propertyRules: parsed.datasetPropertyRules,
    schema: parsed.schema,
    mode: parsed.mode,
    contextTerms: parsed.contextTerms,
    shapesText: parsed.shapesText,
    customShapesText: parsed.customShapesText,
    artifactUrl: parsed.artifactUrl,
    suggestedKeywords: arrayText(entity?.keywords ?? entity?.keyword),
    groupId: item.group_id,
    managed: item.public,
  }
}
