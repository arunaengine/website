<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import ProfileBasicsStep from '@/components/metadata/profile-builder/ProfileBasicsStep.vue'
import ProfileEntityRulesStep from '@/components/metadata/profile-builder/ProfileEntityRulesStep.vue'
import ProfileReviewStep from '@/components/metadata/profile-builder/ProfileReviewStep.vue'
import { useProfileBuilder } from '@/components/metadata/profile-builder/useProfileBuilder'
import { computed, ref, watch } from 'vue'
import { ListChecks, Check, ArrowLeft, ArrowRight } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { MetadataProfile } from '@/data/types'
import { buildProfileCrate } from '@/lib/profiles/rocrate'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', profile: MetadataProfile): void
}>()

const { profiles, createMetadata, saving } = useAruna()
const builder = useProfileBuilder()

const steps = [
  { n: 1, label: 'Basics' },
  { n: 2, label: 'Rules' },
  { n: 3, label: 'Review' },
] as const

const step = ref(1)

const currentStepErrors = computed(() => {
  if (step.value === 1) return builder.basicsErrors
  if (step.value === 2) return builder.rulesErrors
  return builder.allErrors
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    builder.reset()
    step.value = 1
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
  if (builder.allErrors.length || saving.value) return
  builder.submitError = null
  try {
    const basics = builder.profileBasics()
    const entityRules = builder.normalizedEntities
    const profileCrate = buildProfileCrate({ ...basics, entityRules })
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
      suggestedKeywords: [],
      managed: builder.isPublic,
      usedCount: 0,
    }
    emit('created', profile)
    emit('update:open', false)
  } catch (err) {
    builder.submitError = err instanceof Error ? err.message : String(err)
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

      <div class="max-h-[72vh] overflow-y-auto pr-1 scrollbar-thin">
        <ProfileBasicsStep v-if="step === 1" :builder="builder" />
        <ProfileEntityRulesStep v-else-if="step === 2" :builder="builder" />
        <ProfileReviewStep v-else :builder="builder" />

        <div v-if="builder.submitError" class="mt-4 text-xs text-destructive">{{ builder.submitError }}</div>
      </div>

      <DialogFooter class="sm:justify-between">
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <div class="flex items-center gap-2">
          <Button v-if="step > 1" variant="outline" @click="goBack">
            <ArrowLeft class="h-3.5 w-3.5" /> Back
          </Button>
          <Button v-if="step < 3" :disabled="currentStepErrors.length > 0" @click="goNext">
            Next <ArrowRight class="h-3.5 w-3.5" />
          </Button>
          <Button v-else :disabled="builder.allErrors.length > 0 || saving" @click="submit">
            {{ saving ? 'Creating…' : 'Create profile' }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
