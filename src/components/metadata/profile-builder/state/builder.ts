import { computed, reactive, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { buildProfileCrate } from '@/lib/profiles/rocrate'
import { schemaFromEntityRules } from '@/lib/profiles/schema'
import { deriveEntityObligation, referencesToType, type ModeFile } from '@/lib/profiles/mode'
import { isDatasetType, normalizeTypeUri } from '@/lib/profiles/uri'
import type { ProfileBasics, ProfileEntityRule } from '@/lib/profiles/types'
import type { LiftNote } from '@/lib/shacl/lift'
import {
  DEFAULT_LICENSE,
  defaultEntities,
  slugify,
  todayIso,
  toText,
  trimmed,
  type BasicsFieldError,
  type CustomShapesMeta,
  type DraftEntityRule,
  type ImportSummary,
  type ProfileImportResult,
} from './drafts'
import { entityActions } from './entities'
import { propertyActions } from './properties'
import { draftFromEntityRule, normalizeEntity } from './serialization'
import { basicsErrorsFor, rulesErrorsFor, rulesHintsFor } from './validation'

export function useProfileBuilder() {
  const { groups, currentUser } = useAruna()

  const groupId = ref('')
  const name = ref('')
  const slug = ref('')
  const slugTouched = ref(false)
  const description = ref('')
  const version = ref('0.1.0')
  const datePublished = ref(todayIso())
  const license = ref(DEFAULT_LICENSE)
  const isPublic = ref(true)
  const entities = ref<DraftEntityRule[]>(defaultEntities())
  const selectedEntityIndex = ref(0)
  const submitError = ref<string | null>(null)
  // Raw imported mode file, preserved verbatim and re-emitted by buildProfileCrate
  // so features the builder does not model (layouts, lookup, localisation…) survive.
  const importedMode = ref<ModeFile | null>(null)
  // Imported expert SHACL source, kept verbatim inside the unified shapes.ttl.
  const customShapesText = ref('')
  const customShapesMeta = ref<CustomShapesMeta | null>(null)
  // Summary of the last successful import (survives tab/step navigation).
  const importSummary = ref<ImportSummary | null>(null)
  // Parts of an imported SHACL file that produced no editable rule, or only a
  // partial one. Surfaced next to the rules so "no input for X" is visible where
  // the author is working, not only at import time.
  const liftNotes = ref<LiftNote[]>([])
  // uid of a property draft just added by a quick action (M2). PropertyRuleCard
  // watches this to scroll the freshly-created card into view and briefly flash it,
  // then clears it, so a one-click "Add reference" lands the author on the new rule.
  const highlightPropertyUid = ref<number | null>(null)

  // Keep the slug in sync with the name until the author edits the slug directly.
  watch(name, (value) => {
    if (!slugTouched.value) slug.value = slugify(toText(value))
  })

  function reset() {
    groupId.value = groups.value[0]?.id ?? ''
    name.value = ''
    slug.value = ''
    slugTouched.value = false
    description.value = ''
    version.value = '0.1.0'
    datePublished.value = todayIso()
    license.value = DEFAULT_LICENSE
    isPublic.value = true
    submitError.value = null
    importedMode.value = null
    customShapesText.value = ''
    customShapesMeta.value = null
    importSummary.value = null
    liftNotes.value = []
    highlightPropertyUid.value = null
    entities.value = defaultEntities()
    selectedEntityIndex.value = 0
  }

  // True once the author has typed content or changed the rule set, so an
  // import can warn before it replaces the draft wholesale.
  const hasEdits = computed(() => {
    if (importSummary.value) return true
    if (trimmed(name.value) || trimmed(description.value) || trimmed(customShapesText.value)) return true
    const defaults = defaultEntities()
    if (entities.value.length !== defaults.length) return true
    const root = entities.value[0]
    const defaultRoot = defaults[0]
    return Boolean(root && defaultRoot && root.properties.length !== defaultRoot.properties.length)
  })

  // Populate the builder from an imported profile (mode file or profile crate).
  // Imported rules land as fully editable drafts; the raw mode is kept for
  // verbatim re-export. Missing basics fields are left as-is.
  function applyImport(result: ProfileImportResult) {
    const basics = result.basics ?? {}
    if (basics.name !== undefined) name.value = basics.name
    if (basics.description !== undefined) description.value = basics.description
    if (basics.version) version.value = basics.version
    if (basics.datePublished) datePublished.value = basics.datePublished
    if (basics.license) license.value = basics.license
    if (!slugTouched.value && basics.name) slug.value = slugify(basics.name)
    // L2: the first dataset-typed rule is the RO-Crate root; only its baseline four
    // rules re-lock as structural (a nested dataset sub-entity is left untouched).
    const rootIndex = result.entityRules.findIndex((entity) => isDatasetType(normalizeTypeUri(entity.type)))
    const drafts = result.entityRules.map((entity, index) => draftFromEntityRule(entity, index === rootIndex))
    // Every RO-Crate has a root dataset, and the dataset form is generated from
    // its rules. An import that describes none (a SHACL file with only
    // class-targeted shapes, say) would otherwise land the author on a draft that
    // can never be saved, so seed the RO-Crate baseline root alongside it.
    entities.value = drafts.length
      ? (rootIndex >= 0 ? drafts : [...defaultEntities(), ...drafts])
      : defaultEntities()
    selectedEntityIndex.value = 0
    importedMode.value = result.mode ?? null
    customShapesText.value = result.customShapesText ?? ''
    customShapesMeta.value = result.customShapesText
      ? { fileName: result.customShapesName ?? 'Imported SHACL source' }
      : null
    liftNotes.value = result.liftNotes ?? []
    importSummary.value = {
      kind: result.kind ?? 'crate',
      name: result.basics?.name,
      entityCount: result.entityRules.length,
      propertyCount: result.entityRules.reduce((total, entity) => total + entity.propertyRules.length, 0),
      preservedKeys: result.preservedKeys ?? [],
    }
    submitError.value = null
  }

  function setSlug(value: string | number) {
    slug.value = toText(value)
    slugTouched.value = true
  }

  // Attach / replace / remove the expert SHACL file. Callers parse the text
  // first (dynamic import of lift.ts, so n3 stays out of the main bundle) and
  // pass the display metadata they derived.
  function setCustomShapes(text: string, meta: CustomShapesMeta) {
    customShapesText.value = text
    customShapesMeta.value = meta
  }

  function clearCustomShapes() {
    customShapesText.value = ''
    customShapesMeta.value = null
  }

  const selectedEntity = computed<DraftEntityRule | undefined>(() => entities.value[selectedEntityIndex.value])

  const { selectEntity, addEntity, addEntityRuleForType, addReferenceProperty, addEntityTemplate, removeEntity } =
    entityActions(entities, selectedEntityIndex, highlightPropertyUid)
  const { addProperty, addPropertyTemplate, moveProperty, removeProperty } = propertyActions(highlightPropertyUid)

  function profileBasics(): ProfileBasics {
    return {
      slug: trimmed(slug.value),
      name: trimmed(name.value),
      description: trimmed(description.value),
      version: trimmed(version.value) || undefined,
      datePublished: toText(datePublished.value),
      license: trimmed(license.value),
    }
  }

  const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))

  const normalizedEntities = computed(() => {
    const slugValue = trimmed(slug.value)
    return entities.value
      .map((entity, index) => normalizeEntity(entity, index, slugValue))
      .filter((entity): entity is ProfileEntityRule => Boolean(entity))
  })
  const datasetEntity = computed(() => normalizedEntities.value.find((entity) => isDatasetType(entity.type)))
  const generatedSchema = computed(() => schemaFromEntityRules(profileBasics(), normalizedEntities.value))
  const generatedCrate = computed(() =>
    buildProfileCrate({
      ...profileBasics(),
      entityRules: normalizedEntities.value,
      importedMode: importedMode.value ?? undefined,
      customShapesText: trimmed(customShapesText.value) ? customShapesText.value : undefined,
    }),
  )
  const generatedCrateText = computed(() => JSON.stringify(generatedCrate.value, null, 2))

  // Read-only derived obligation for an entity type: MUST/SHOULD/MAY plus the
  // referencing property that explains the derivation (for the editor badge).
  function entityObligation(entityType: string) {
    return deriveEntityObligation(normalizeTypeUri(entityType), normalizedEntities.value)
  }

  // Every entity-reference property that points at this type (L8), the single
  // shared traversal behind the editor's "Referenced by" panel and the master
  // list's unreferenced-rule warning. An empty result means the rule is inert.
  function entityReferences(entityType: string) {
    return referencesToType(normalizeTypeUri(entityType), normalizedEntities.value)
  }

  // Same condition basicsErrors uses for the bearer-token requirement, exposed
  // as a boolean so the UI can gate the token banner without string matching.
  const needsToken = computed(() => !currentUser.value)

  const basicsFieldErrors = computed<BasicsFieldError[]>(() =>
    basicsErrorsFor({
      needsToken: needsToken.value,
      groupId: groupId.value,
      slug: slug.value,
      name: name.value,
      description: description.value,
      version: version.value,
      datePublished: datePublished.value,
      license: license.value,
    }),
  )

  const basicsErrors = computed(() => basicsFieldErrors.value.map((error) => error.message))

  const rulesErrors = computed(() => rulesErrorsFor(entities.value, normalizedEntities.value, datasetEntity.value))

  const rulesHints = computed(() => rulesHintsFor(entities.value, normalizedEntities.value))

  const allErrors = computed(() => [...basicsErrors.value, ...rulesErrors.value])

  return reactive({
    // basics state
    groupId,
    name,
    slug,
    description,
    version,
    datePublished,
    license,
    isPublic,
    // rules state
    entities,
    selectedEntityIndex,
    selectedEntity,
    submitError,
    importedMode,
    customShapesText,
    customShapesMeta,
    importSummary,
    liftNotes,
    hasEdits,
    highlightPropertyUid,
    // options
    groupOptions,
    // derived artifacts
    normalizedEntities,
    datasetEntity,
    generatedSchema,
    generatedCrate,
    generatedCrateText,
    entityObligation,
    entityReferences,
    // validation
    needsToken,
    basicsFieldErrors,
    basicsErrors,
    rulesErrors,
    rulesHints,
    allErrors,
    // methods
    reset,
    applyImport,
    setSlug,
    setCustomShapes,
    clearCustomShapes,
    selectEntity,
    addEntity,
    addEntityRuleForType,
    addReferenceProperty,
    addEntityTemplate,
    removeEntity,
    addProperty,
    addPropertyTemplate,
    moveProperty,
    removeProperty,
    profileBasics,
  })
}

export type ProfileBuilder = ReturnType<typeof useProfileBuilder>

