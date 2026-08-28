<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import DiscardDraftConfirm from '@/components/ui/DiscardDraftConfirm.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ImportProfileSection from '@/components/metadata/profile-builder/ImportProfileSection.vue'
import ProfileBasicsStep from '@/components/metadata/profile-builder/ProfileBasicsStep.vue'
import ProfileEntityRulesStep from '@/components/metadata/profile-builder/ProfileEntityRulesStep.vue'
import ProfileReviewStep from '@/components/metadata/profile-builder/ProfileReviewStep.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import { useProfileBuilder } from '@/components/metadata/profile-builder/useProfileBuilder'
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { CheckCircle2, ArrowLeft, ArrowRight, FileUp, KeyRound, Lock, Plus } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import { useProfilePublish } from '@/composables/useProfilePublish'
import type { MetadataProfile } from '@/data/types'
import { buildProfileArtifactTexts, buildProfileCrate } from '@/lib/profiles/rocrate'
import { entityRulesToMode } from '@/lib/profiles/mode'
import { parseS3Url } from '@/lib/tes'
import { errorMessage } from '@/lib/utils'

const route = useRoute()
const router = useRouter()
const {
  groups,
  profiles,
  profileItems,
  createMetadata,
  replaceMetadataRoCrate,
  loadProfileCrate,
  saving,
} = useAruna()

// The edit route carries the profile slug; the create route carries none. The
// profile itself comes from the loaded list, so its rules arrive with the crate.
const editId = computed(() => String(route.params.profileId ?? ''))
const editProfile = computed<MetadataProfile | null>(() =>
  editId.value ? profiles.value.find((profile) => profile.id === editId.value) ?? null : null,
)
const isEditing = computed(() => Boolean(editId.value))
const s3 = useS3()
const { publishProfileArtifacts } = useProfilePublish()
const builder = useProfileBuilder()

// Public profiles upload their three artifacts to the group's S3 profiles
// bucket at create time, so publishing needs an active S3 key.
const publishBlocked = computed(() => builder.isPublic && (!s3.endpoint.value || !s3.hasActiveKey.value))
const publishing = ref(false)
const credentialDialogOpen = ref(false)

// Publish destination (public profiles only). `destBucket` is an override: an
// empty string means "use the dedicated default bucket", so it stays correct
// even as the group changes the computed default. `destPrefix` tracks
// profiles/<slug> until the author edits it.
const destBucket = ref('')
const destPrefix = ref('')
const destPrefixEdited = ref(false)
const destBuckets = ref<string[]>([])

const defaultDestBucket = computed(() => `profiles-${builder.groupId.toLowerCase()}`)
const defaultDestPrefix = computed(() => `profiles/${builder.slug.trim()}`)
const selectedDestBucket = computed(() => destBucket.value || defaultDestBucket.value)

const destBucketOptions = computed(() => {
  const def = defaultDestBucket.value
  const options = [{ value: def, label: `${def} (default)` }]
  // The current override is listed even before the bucket listing arrives, so
  // an edited profile's remembered destination renders immediately.
  for (const name of [...(destBucket.value ? [destBucket.value] : []), ...destBuckets.value]) {
    if (!options.some((option) => option.value === name)) options.push({ value: name, label: name })
  }
  return options
})

// A best-effort preview of the written key path, cleaned the way the publish
// flow sanitizes the prefix (leading/trailing and doubled slashes removed).
const destExamplePath = computed(() => {
  const prefix = (destPrefix.value.trim() || defaultDestPrefix.value)
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
  return `${selectedDestBucket.value}/${prefix || defaultDestPrefix.value}/shapes.ttl`
})

function onDestBucketChange(value: string) {
  destBucket.value = value === defaultDestBucket.value ? '' : value
}
function onDestPrefixInput(value: string) {
  destPrefixEdited.value = true
  destPrefix.value = value
}

// Keep the prefix in step with the slug until the author overrides it.
watch(
  () => builder.slug,
  (slug) => {
    if (!destPrefixEdited.value) destPrefix.value = `profiles/${slug.trim()}`
  },
)

// Load the group's existing buckets once the destination block is visible.
async function loadDestBuckets() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
  try {
    destBuckets.value = (await s3.listBuckets()).map((entry) => entry.name)
  } catch {
    destBuckets.value = []
  }
}

const steps = ['Basics', 'Rules', 'Review']

const step = ref(1)
// Step 1 mode switch: author from scratch or import an existing profile.
const startTab = ref('create')
const duplicateNameError = computed(() => {
  if (isEditing.value) return ''
  const name = builder.name.trim().toLowerCase()
  return name && profiles.value.some((profile) => profile.name.trim().toLowerCase() === name)
    ? 'A profile with this name already exists.'
    : ''
})
const formErrors = computed(() => duplicateNameError.value ? [...builder.allErrors, duplicateNameError.value] : builder.allErrors)

// Fetch the group's buckets when the publish destination block first appears.
watch(
  () => step.value === 3 && builder.isPublic && !publishBlocked.value,
  (visible) => {
    if (visible) loadDestBuckets()
  },
)

// Leaving the page (Cancel, a nav click, the browser back button) while the
// builder has edits asks before discarding. A saved draft leaves freely.
const confirmDiscardOpen = ref(false)
const submitted = ref(false)
let leave: ((allowed: boolean) => void) | null = null

onBeforeRouteLeave(
  () =>
    new Promise<boolean>((resolve) => {
      if (submitted.value || !builder.hasEdits) {
        resolve(true)
        return
      }
      leave = resolve
      confirmDiscardOpen.value = true
    }),
)

function keepDraft() {
  confirmDiscardOpen.value = false
  leave?.(false)
  leave = null
}

function discardDraft() {
  confirmDiscardOpen.value = false
  leave?.(true)
  leave = null
}

function cancel() {
  void router.push(isEditing.value ? { name: 'profile', params: { profileId: editId.value } } : { name: 'profiles' })
}

const currentStepErrors = computed(() => {
  if (step.value === 1) return duplicateNameError.value ? [...builder.basicsErrors, duplicateNameError.value] : builder.basicsErrors
  if (step.value === 2) return builder.rulesErrors
  return formErrors.value
})

// The step callout only lists errors with no field anchor; basics errors are
// rendered inline at their inputs (or by the token banner), so step 1 shows
// only unanchored leftovers, plus a pointer while the Create tab is hidden.
const currentStepCallout = computed(() => {
  if (step.value === 1) {
    const unanchored = builder.basicsFieldErrors.filter((error) => !error.fieldId).map((error) => error.message)
    if (duplicateNameError.value) unanchored.push(duplicateNameError.value)
    if (startTab.value === 'import' && builder.basicsFieldErrors.some((error) => error.fieldId && error.fieldId !== 'token')) {
      return [...unanchored, 'Finish the profile details in the Create tab, importing prefills them.']
    }
    return unanchored
  }
  if (step.value === 2) return builder.rulesErrors
  return formErrors.value
})

// Seed once: a create page starts on the RO-Crate baseline, an edit page waits
// for the stored crate so the builder opens on the profile's real rules.
const seeded = ref(false)

function seedDraft(profile: MetadataProfile | null) {
  builder.reset()
  step.value = 1
  startTab.value = 'create'
  destBucket.value = ''
  destPrefixEdited.value = false
  destBuckets.value = []
  if (profile) {
    builder.applyImport({
      kind: 'crate',
      basics: { name: profile.name, description: profile.description, version: profile.version },
      entityRules: profile.entityRules,
      mode: profile.mode ?? null,
      // Re-editing keeps an attached shapes.custom.ttl verbatim.
      customShapesText: profile.customShapesText,
    })
    // Editing keeps the document identity: path profiles/<slug> and group.
    builder.setSlug(profile.id)
    const item = profileItems.value.find((entry) => entry.document_id === profile.documentId)
    if (item) builder.groupId = item.group_id
    builder.isPublic = profile.managed
    // The import chip is meant for the import tab, not the edit seeding.
    builder.importSummary = null
  }
  // Seed the destination prefix from the now-final slug.
  destPrefix.value = `profiles/${builder.slug.trim()}`
  // Editing a published profile keeps its actual destination: derive bucket
  // and prefix from a stored artifact URL instead of the computed default.
  const published = profile?.artifactUrl ? parseS3Url(profile.artifactUrl, s3.endpoint.value) : null
  if (published) {
    destBucket.value = published.bucket === defaultDestBucket.value ? '' : published.bucket
    const prefix = published.key.split('/').slice(0, -1).join('/')
    if (prefix && prefix !== destPrefix.value) {
      destPrefix.value = prefix
      destPrefixEdited.value = true
    }
  }
  seeded.value = true
}

watch(
  editProfile,
  async (profile) => {
    if (seeded.value) return
    if (!isEditing.value) {
      seedDraft(null)
      return
    }
    if (!profile) return
    // A list summary can omit the rule artifacts; materialize the crate first so
    // the builder never opens on a rule-less draft. A failure keeps the summary.
    if (profile.documentId) await loadProfileCrate(profile.documentId).catch(() => undefined)
    if (!seeded.value) seedDraft(editProfile.value)
  },
  { immediate: true },
)

// A page can open before the group list arrives, so fill the default once it does.
watch(groups, (available) => {
  if (!builder.groupId && available.length) builder.groupId = available[0].id
})

function goBack() {
  if (step.value > 1) step.value -= 1
}

function goNext() {
  if (step.value < 3 && !currentStepErrors.value.length) step.value += 1
}

async function submit() {
  if (formErrors.value.length || saving.value || publishing.value || publishBlocked.value) return
  builder.submitError = null
  publishing.value = true
  try {
    const basics = builder.profileBasics()
    const entityRules = builder.normalizedEntities
    const crateInput = {
      ...basics,
      entityRules,
      importedMode: builder.importedMode ?? undefined,
      customShapesText: builder.customShapesText.trim() ? builder.customShapesText : undefined,
    }
    // Public profiles publish mode/schema/html/shapes to S3 and reference them
    // by DRS id + contentUrl; private profiles keep the artifacts embedded as text.
    // A destination that resolves to today's default is passed as undefined so
    // the default publish path stays byte-identical.
    const chosenBucket = selectedDestBucket.value
    const chosenPrefix = destPrefix.value.trim()
    const isDefaultDestination =
      chosenBucket === `profiles-${builder.groupId.toLowerCase()}` && chosenPrefix === `profiles/${basics.slug}`
    const destination = isDefaultDestination
      ? undefined
      : { bucket: chosenBucket, prefix: chosenPrefix || undefined }
    const externalArtifacts = builder.isPublic
      ? await publishProfileArtifacts(builder.groupId, basics.slug, buildProfileArtifactTexts(crateInput), destination)
      : undefined
    const profileCrate = buildProfileCrate({ ...crateInput, externalArtifacts })
    const edited = editProfile.value
    if (edited?.documentId) {
      await replaceMetadataRoCrate(edited.documentId, {
        rocrate: profileCrate,
        public: builder.isPublic,
      })
      submitted.value = true
      void router.push({ name: 'profile', params: { profileId: edited.id } })
      return
    }
    const created = await createMetadata({
      group_id: builder.groupId,
      path: `profiles/${basics.slug}`,
      public: builder.isPublic,
      rocrate: profileCrate,
    })
    const profile = profiles.value.find((item) => item.id === basics.slug) ?? {
      id: basics.slug,
      documentId: created.document_id,
      documentPath: created.document_path,
      graphIri: created.graph_iri,
      profileUri: created.graph_iri,
      name: basics.name,
      shortName: basics.name.split(/\s+/)[0] || basics.slug,
      description: basics.description,
      domain: 'RO-Crate Profile',
      version: basics.version,
      iconColor: '#335DC6',
      entityRules,
      propertyRules: builder.datasetEntity?.propertyRules ?? [],
      schema: builder.generatedSchema,
      // D9: carry the GENERATED mode (our rules merged over any imported mode), so
      // the fallback profile matches what was written to the crate, not the raw
      // imported mode, which would omit builder edits.
      mode: entityRulesToMode(basics, entityRules, builder.importedMode ?? undefined),
      suggestedKeywords: [],
      managed: builder.isPublic,
    }
    submitted.value = true
    void router.push({ name: 'profile', params: { profileId: profile.id } })
  } catch (err) {
    builder.submitError = errorMessage(err)
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="relative">
    <PageHeader
      eyebrow="Profiles"
      :title="isEditing ? 'Edit profile' : 'New profile'"
      :description="isEditing
        ? 'Adjust the profile\'s rules and details; saving replaces the stored profile in place.'
        : 'Define which RO-Crate entities must, should, or may exist, and the property rules for each, step by step.'"
    />

    <div class="container space-y-5 py-6">
      <WizardSteps :steps="steps" :current="step - 1" />

      <div class="surface space-y-4 p-5">
        <ProfileBasicsStep v-if="step === 1 && isEditing" :builder="builder" locked />
        <Tabs v-else-if="step === 1" v-model="startTab">
          <TabsList>
            <TabsTrigger value="create"><Plus class="mr-1 size-3.5" /> Create</TabsTrigger>
            <TabsTrigger value="import"><FileUp class="mr-1 size-3.5" /> Import existing</TabsTrigger>
          </TabsList>
          <TabsContent value="create" class="space-y-4">
            <p v-if="!builder.importSummary" class="text-[11px] text-muted-foreground">
              Starting from an existing profile RO-Crate or a Describo/Crate-O mode file? Switch to
              <button type="button" class="font-medium text-aruna-royal underline-offset-2 hover:underline" @click="startTab = 'import'">Import existing</button>
              above.
            </p>
            <div v-if="builder.importSummary" class="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
              <span>
                Imported from {{ builder.importSummary.kind === 'mode' ? 'a mode file' : 'a profile RO-Crate' }}<template v-if="builder.importSummary.name">: <b>{{ builder.importSummary.name }}</b></template>, review the prefilled fields below.
              </span>
            </div>
            <ProfileBasicsStep :builder="builder" />
          </TabsContent>
          <TabsContent value="import">
            <ImportProfileSection :builder="builder" @imported="startTab = 'create'" />
          </TabsContent>
        </Tabs>
        <ProfileEntityRulesStep v-else-if="step === 2" :builder="builder" />
        <ProfileReviewStep v-else :builder="builder" />

        <Notice v-if="builder.submitError" tone="error">{{ builder.submitError }}</Notice>
      </div>

      <Notice
        v-if="step < 3 && currentStepCallout.length"
        tone="warning"
        title="To continue:"
        :lines="currentStepCallout"
      />

      <!-- Publish destination. Always rendered on the review step, including when
           the profile is private or publishing is blocked: an author who came
           looking for "which bucket does this go to" must find an answer rather
           than an absent control. -->
      <div v-if="step === 3" class="surface px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-xs font-medium text-foreground">Publish destination</div>
            <p class="mt-0.5 text-[11px] text-muted-foreground">
              Where this profile's artifacts (mode.json, schema.json, profile.html, shapes.ttl) are stored.
            </p>
          </div>
          <label class="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            Public profile
            <Switch :checked="builder.isPublic" @update:checked="(value: boolean) => (builder.isPublic = value)" />
          </label>
        </div>

        <!-- Private: nothing is uploaded, so there is no bucket to choose. -->
        <p v-if="!builder.isPublic" class="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Lock class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This profile is private, so its artifacts stay embedded in the profile and no bucket is used.
            Turn on <b class="text-foreground">Public profile</b> to publish them where other tools can fetch them without a token.
          </span>
        </p>

        <!-- Public, but nothing to publish with yet. -->
        <Notice
          v-else-if="publishBlocked"
          tone="warning"
          class="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
        >
          <span class="flex items-center gap-2">
            <KeyRound class="h-3.5 w-3.5 shrink-0" />
            <template v-if="!s3.endpoint.value">
              Public profiles publish their artifacts to this node's S3 storage, but the node does not advertise an S3 endpoint.
            </template>
            <template v-else>
              Choosing a bucket needs S3 credentials for this group, create them to pick a destination and publish.
            </template>
          </span>
          <Button v-if="s3.endpoint.value" variant="outline" size="sm" @click="credentialDialogOpen = true">
            <Plus class="size-3.5" /> Create credentials
          </Button>
        </Notice>

        <div v-else class="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">Bucket</label>
            <Select
              class="mt-1"
              :options="destBucketOptions"
              :model-value="selectedDestBucket"
              aria-label="Publish destination bucket"
              @update:model-value="onDestBucketChange"
            />
          </div>
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">Prefix</label>
            <Input
              class="mt-1"
              :model-value="destPrefix"
              placeholder="profiles/slug"
              aria-label="Publish destination prefix"
              @update:model-value="(value: string | number) => onDestPrefixInput(String(value))"
            />
          </div>
        </div>
        <template v-if="builder.isPublic && !publishBlocked">
          <p class="mt-2 text-[11px] text-muted-foreground">
            Files go to <code class="text-foreground">{{ destExamplePath }}</code>
          </p>
          <p class="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
            Everything under this destination becomes publicly readable.
          </p>
        </template>
      </div>

      <div class="flex items-center justify-between gap-2">
        <Button variant="outline" @click="cancel">Cancel</Button>
        <div class="flex items-center gap-2">
          <Button v-if="step > 1" variant="outline" @click="goBack">
            <ArrowLeft class="h-3.5 w-3.5" /> Back
          </Button>
          <Button v-if="step < 3" :disabled="currentStepErrors.length > 0" @click="goNext">
            Next <ArrowRight class="h-3.5 w-3.5" />
          </Button>
          <Button v-else :disabled="formErrors.length > 0 || saving || publishing || publishBlocked" @click="submit">
            {{ publishing ? 'Publishing…' : saving ? 'Saving…' : isEditing ? 'Save profile' : 'Create profile' }}
          </Button>
        </div>
      </div>
    </div>

    <CreateCredentialDialog v-model:open="credentialDialogOpen" />

    <DiscardDraftConfirm :open="confirmDiscardOpen" @keep="keepDraft" @discard="discardDraft" />
  </div>
</template>
