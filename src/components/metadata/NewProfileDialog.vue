<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
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
import { ListChecks, Check, CheckCircle2, ArrowLeft, ArrowRight, KeyRound, Plus } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import { useProfilePublish } from '@/composables/useProfilePublish'
import type { MetadataProfile } from '@/data/types'
import { buildProfileArtifactTexts, buildProfileCrate } from '@/lib/profiles/rocrate'
import { entityRulesToMode } from '@/lib/profiles/mode'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', profile: MetadataProfile): void
}>()

const { profiles, createMetadata, saving } = useAruna()
const s3 = useS3()
const { publishProfileArtifacts } = useProfilePublish()
const builder = useProfileBuilder()

// Public profiles upload their three artifacts to the group's S3 profiles
// bucket at create time, so publishing needs an active S3 key.
const publishBlocked = computed(() => builder.isPublic && (!s3.endpoint.value || !s3.hasActiveKey.value))
const publishing = ref(false)
const credentialDialogOpen = ref(false)

const steps = [
  { n: 1, label: 'Basics' },
  { n: 2, label: 'Rules' },
  { n: 3, label: 'Review' },
] as const

const step = ref(1)
// Step 1 mode switch: author from scratch or import an existing profile.
const startTab = ref('create')

const currentStepErrors = computed(() => {
  if (step.value === 1) return builder.basicsErrors
  if (step.value === 2) return builder.rulesErrors
  return builder.allErrors
})

// The step callout only lists errors with no field anchor — basics errors are
// rendered inline at their inputs (or by the token banner), so step 1 shows
// only unanchored leftovers, plus a pointer while the Create tab is hidden.
const currentStepCallout = computed(() => {
  if (step.value === 1) {
    const unanchored = builder.basicsFieldErrors.filter((error) => !error.fieldId).map((error) => error.message)
    if (startTab.value === 'import' && builder.basicsFieldErrors.some((error) => error.fieldId && error.fieldId !== 'token')) {
      return [...unanchored, 'Finish the profile details in the Create tab — importing prefills them.']
    }
    return unanchored
  }
  if (step.value === 2) return builder.rulesErrors
  return builder.allErrors
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    builder.reset()
    step.value = 1
    startTab.value = 'create'
  },
  { immediate: true },
)

function goToStep(target: number) {
  // Completed steps are clickable to go back; forward moves stay gated.
  if (target < step.value) step.value = target
}

function goBack() {
  if (step.value > 1) step.value -= 1
}

function goNext() {
  if (step.value < 3 && !currentStepErrors.value.length) step.value += 1
}

async function submit() {
  if (builder.allErrors.length || saving.value || publishing.value || publishBlocked.value) return
  builder.submitError = null
  publishing.value = true
  try {
    const basics = builder.profileBasics()
    const entityRules = builder.normalizedEntities
    const crateInput = { ...basics, entityRules, importedMode: builder.importedMode ?? undefined }
    // Public profiles publish mode/schema/html to S3 and reference them by DRS
    // id + contentUrl; private profiles keep the artifacts embedded as text.
    const externalArtifacts = builder.isPublic
      ? await publishProfileArtifacts(builder.groupId, basics.slug, buildProfileArtifactTexts(crateInput))
      : undefined
    const profileCrate = buildProfileCrate({ ...crateInput, externalArtifacts })
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
      // the fallback profile matches what was written to the crate — not the raw
      // imported mode, which would omit builder edits.
      mode: entityRulesToMode(basics, entityRules, builder.importedMode ?? undefined),
      suggestedKeywords: [],
      managed: builder.isPublic,
      usedCount: 0,
    }
    emit('created', profile)
    emit('update:open', false)
  } catch (err) {
    builder.submitError = err instanceof Error ? err.message : String(err)
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-6xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ListChecks class="h-4 w-4 text-primary" /> New metadata profile
        </DialogTitle>
        <DialogDescription>
          Define which RO-Crate entities must, should, or may exist, and the property rules for each — step by step.
        </DialogDescription>
      </DialogHeader>

      <!-- Step indicator -->
      <div class="flex items-center gap-2">
        <template v-for="(s, index) in steps" :key="s.n">
          <button
            type="button"
            class="flex items-center gap-2"
            :class="s.n > step ? 'cursor-default' : 'cursor-pointer'"
            :disabled="s.n > step"
            @click="goToStep(s.n)"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors"
              :class="s.n < step
                ? 'border-transparent bg-primary text-primary-foreground'
                : s.n === step
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground'"
            >
              <Check v-if="s.n < step" class="h-3.5 w-3.5" />
              <template v-else>{{ s.n }}</template>
            </span>
            <span
              class="text-sm font-medium"
              :class="s.n === step ? 'text-foreground' : 'text-muted-foreground'"
            >{{ s.label }}</span>
          </button>
          <div v-if="index < steps.length - 1" class="h-px flex-1 bg-border" />
        </template>
      </div>

      <div class="max-h-[72vh] overflow-y-auto px-1 scrollbar-thin">
        <Tabs v-if="step === 1" v-model="startTab">
          <TabsList>
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="import">Import existing</TabsTrigger>
          </TabsList>
          <TabsContent value="create" class="space-y-4">
            <div v-if="builder.importSummary" class="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
              <span>
                Imported from {{ builder.importSummary.kind === 'mode' ? 'a mode file' : 'a profile crate' }}<template v-if="builder.importSummary.name">: <b>{{ builder.importSummary.name }}</b></template> — review the prefilled fields below.
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

        <div v-if="builder.submitError" class="mt-4 text-xs text-destructive">{{ builder.submitError }}</div>
      </div>

      <div
        v-if="step < 3 && currentStepCallout.length"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        <div class="font-medium">To continue:</div>
        <ul class="mt-1 list-disc space-y-0.5 pl-4">
          <li v-for="error in currentStepCallout" :key="error">{{ error }}</li>
        </ul>
      </div>

      <div
        v-if="step === 3 && publishBlocked"
        class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        <span class="flex items-center gap-2">
          <KeyRound class="h-3.5 w-3.5 shrink-0" />
          <template v-if="!s3.endpoint.value">
            Public profiles publish their artifacts to this node's S3 storage, but the node does not advertise an S3 endpoint.
          </template>
          <template v-else>
            Public profiles publish their artifacts to S3 so other tools can fetch them without a token — create S3 credentials for this group first.
          </template>
        </span>
        <Button v-if="s3.endpoint.value" variant="outline" size="sm" @click="credentialDialogOpen = true">
          <Plus class="size-3.5" /> Create credentials
        </Button>
      </div>

      <DialogFooter class="sm:justify-between">
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <div class="flex items-center gap-2">
          <Button v-if="step > 1" variant="outline" @click="goBack">
            <ArrowLeft class="h-3.5 w-3.5" /> Back
          </Button>
          <Button v-if="step < 3" :disabled="currentStepErrors.length > 0" @click="goNext">
            Next <ArrowRight class="h-3.5 w-3.5" />
          </Button>
          <Button v-else :disabled="builder.allErrors.length > 0 || saving || publishing || publishBlocked" @click="submit">
            {{ publishing ? 'Publishing…' : saving ? 'Creating…' : 'Create profile' }}
          </Button>
        </div>
      </DialogFooter>

      <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    </DialogContent>
  </Dialog>
</template>
