<script setup lang="ts">
// The profile tutorial: the real profile builder, then the real dataset editor
// validating against the profile it just wrote. Both run on a seeded draft
// answered from fixtures. Nothing reaches a node while the session runs, and
// leaving the route ends it.
import { computed, onUnmounted, provide, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ProfileNewView from '@/views/ProfileNewView.vue'
import DatasetEditorView from '@/views/DatasetEditorView.vue'
import Notice from '@/components/ui/Notice.vue'
import { PROFILE_BUILDER, useProfileBuilder } from '@/components/metadata/profile-builder/useProfileBuilder'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useOnboarding } from '@/composables/useOnboarding'
import {
  TUTORIAL_PROFILE_BASICS,
  TUTORIAL_PROFILE_RULES,
  TUTORIAL_PROFILE_SLUG,
} from '@/lib/tutorial/fixtures/profile'
import { tutorialProfileApi } from '@/lib/tutorial/services/tutorialProfileApi'
import {
  TUTORIAL_EDITOR_ROUTE,
  TUTORIAL_SAVED_ROUTE,
  profileTutorialSteps,
} from '@/lib/tutorial/steps/profile'
import {
  exitTutorial,
  startTutorial,
  syncTutorialRoute,
  tutorialStatus,
} from '@/lib/tutorial/session'

const route = useRoute()
const router = useRouter()
const { markTutorialDone } = useOnboarding()

const stage = computed(() => String(route.query.stage ?? ''))

// The tutorial works in the group the reader already works in, so the practice
// profile is one their own datasets may declare. Nothing is written either way.
const fixtures = tutorialProfileApi(() => activeGroupId.value)

// The builder's own store, seeded with a profile worth reading, then provided
// so ProfileNewView adopts it instead of starting an empty one.
const builder = useProfileBuilder()
provide(PROFILE_BUILDER, builder)

// Restart puts the draft back the way the tutorial found it.
function seedDraft() {
  builder.applyImport({
    kind: 'crate',
    basics: TUTORIAL_PROFILE_BASICS,
    entityRules: TUTORIAL_PROFILE_RULES,
  })
  builder.setSlug(TUTORIAL_PROFILE_SLUG)
  builder.groupId = activeGroupId.value
  // A practice profile has nothing to publish, and group profiles need no key.
  builder.isPublic = false
  // The import chip belongs to the import tab, not to this seeding.
  builder.importSummary = null
}
seedDraft()

startTutorial({
  id: 'profile',
  steps: profileTutorialSteps,
  api: fixtures.api,
  reset: () => {
    fixtures.reset()
    seedDraft()
  },
})

// A group that resolves after the page opened still owns the draft.
watch(activeGroupId, (groupId) => {
  if (groupId && !builder.groupId) builder.groupId = groupId
})

watch(() => route.fullPath, syncTutorialRoute)

// Finishing records the tutorial; finishing or leaving it hands the reader back
// to Profiles, so this route is never left standing without a session.
watch(tutorialStatus, (status) => {
  if (status === 'running') return
  if (status === 'done') {
    exitTutorial()
    void markTutorialDone('profile')
  }
  void router.push({ name: 'profiles' })
})

// A create navigates to what it created; the tutorial redirects that to its own
// next stage, and any other departure simply ends the session.
onBeforeRouteLeave((to) => {
  if (tutorialStatus.value === 'idle') return true
  if (to.name === 'profile') return TUTORIAL_EDITOR_ROUTE
  if (to.name === 'dataset') return TUTORIAL_SAVED_ROUTE
  exitTutorial()
  return true
})

onUnmounted(exitTutorial)
</script>

<template>
  <div>
    <div class="container pt-6">
      <Notice tone="info">
        <span class="font-medium">Tutorial:</span>
        this is a practice profile on made-up rules. Nothing is created, and no request leaves your browser.
      </Notice>
    </div>

    <div v-if="stage === 'saved'" class="container py-8">
      <div data-tutorial="tutorial-done" class="surface space-y-2 p-5">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">The dataset was accepted</h2>
        <p class="text-sm text-muted-foreground">
          The check ran once more and the write went through. A real save stores the crate, mints the
          dataset's permanent identifier, and records which profile it was validated against.
        </p>
        <p class="text-sm text-muted-foreground">
          From here a profile is edited like any dataset, and every tagged write is checked against
          the version of it that is stored.
        </p>
      </div>
    </div>
    <DatasetEditorView v-else-if="stage === 'editor'" />
    <ProfileNewView v-else />
  </div>
</template>
