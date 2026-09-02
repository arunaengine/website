<script setup lang="ts">
// Realm admin view of the rules that govern where copies of data may be
// stored. Record placement, which decides where dataset records and system
// jobs live, is a different tab and a different machine.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PlacementEnforcement from '@/components/storage/PlacementEnforcement.vue'
import PlacementRuleEditor from '@/components/storage/PlacementRuleEditor.vue'
import PolicyLibrary from '@/components/storage/PolicyLibrary.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { ShieldCheck } from '@lucide/vue'

const { bootstrapped, currentUser, isRealmAdmin } = useAruna()
const { placementAdminEnabled, loadPolicyPage } = usePlacementPolicies()

const ready = computed(
  () => bootstrapped.value && placementAdminEnabled.value && Boolean(currentUser.value) && isRealmAdmin.value,
)

const inspected = ref('')
let loaded = false
watch(
  ready,
  (isReady) => {
    if (!isReady || loaded) return
    loaded = true
    void loadPolicyPage()
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <div v-if="!bootstrapped" class="container space-y-3 py-8">
      <Skeleton class="h-24" />
      <Skeleton class="h-40" />
    </div>

    <div v-else-if="!placementAdminEnabled" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8">
        <EmptyState
          title="Data placement is not enabled on this portal"
          description="Set features.placementAdmin in portal-config.json for a backend that serves the placement routes."
        >
          <template #icon><ShieldCheck class="size-8" /></template>
        </EmptyState>
      </section>
    </div>

    <div v-else class="container space-y-5 py-6">
      <p class="text-sm text-muted-foreground">
        A placement policy lists where copies of governed data may be stored; it allows or refuses
        a copy and never creates, moves or removes one.
        <DocsLink icon topic="where-data-lives" section="Placement policies" class="ml-0.5" />
      </p>

      <PolicyLibrary />

      <section class="surface">
        <header class="flex items-center gap-2 border-b border-border px-5 py-4">
          <ShieldCheck class="size-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Publish a policy for the realm</h2>
        </header>
        <div class="p-5">
          <PlacementRuleEditor :owner-group-id="null" owner-label="Realm" />
        </div>
      </section>

      <section class="surface">
        <header class="flex items-center gap-2 border-b border-border px-5 py-4">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Attach a policy to a bucket</h2>
        </header>
        <div class="space-y-2 px-5 py-4">
          <p class="text-xs text-muted-foreground">
            A bucket carries its rules on its own Storage page, together with what this node
            observed about it.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Input v-model="inspected" class="max-w-xs" placeholder="Bucket name" aria-label="Bucket to open" />
            <Button v-if="inspected.trim()" as-child>
              <RouterLink
                :to="{ name: 'bucket-storage', params: { bucketId: inspected.trim() }, query: { tab: 'placement' } }"
              >
                Open its Storage page
              </RouterLink>
            </Button>
            <span v-else class="text-xs text-muted-foreground">Name a bucket to open its Storage page.</span>
          </div>
        </div>
      </section>

      <PlacementEnforcement :ready="ready" />
    </div>
  </div>
</template>
