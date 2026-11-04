<script setup lang="ts">
import SectionHeading from '@/components/ui/SectionHeading.vue'
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { FEATURE_GROUPS } from '@/lib/features'
import { errorMessage } from '@/lib/utils'
import { Save, SlidersHorizontal } from '@lucide/vue'

const { realmDefaults, defaultsLoading, saveDefaults } = usePortalFeatures()

const draft = ref<Record<string, boolean>>({})
const saving = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

watch(
  realmDefaults,
  (defaults) => {
    draft.value = Object.fromEntries(
      FEATURE_GROUPS.flatMap((group) => group.features).map((info) => [info.key, defaults[info.key] !== false]),
    )
  },
  { immediate: true },
)

async function save() {
  saving.value = true
  message.value = null
  error.value = null
  try {
    await saveDefaults({ ...draft.value })
    message.value = 'Defaults saved.'
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section>
    <SectionHeading title="Portal features" :icon="SlidersHorizontal" :level="3" info="Defaults for members without their own choice. Admins see all features.">
      <template #actions>
        <Button size="sm" :disabled="saving || defaultsLoading" @click="save"><Save class="h-3.5 w-3.5" /> Save</Button>
      </template>
    </SectionHeading>
    <div class="surface">
    <div class="grid gap-x-8 gap-y-5 p-5 lg:grid-cols-2">
      <div v-for="group in FEATURE_GROUPS" :key="group.label">
        <h4 class="text-xs font-semibold text-muted-foreground">{{ group.label }}</h4>
        <ul class="mt-1 divide-y divide-border">
          <li v-for="info in group.features" :key="info.key" class="flex items-center gap-4 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-foreground">{{ info.label }}</div>
              <div class="text-xs text-muted-foreground">{{ info.description }}</div>
            </div>
            <Switch
              :checked="draft[info.key]"
              :disabled="saving || defaultsLoading"
              :aria-label="info.label"
              @update:checked="(value: boolean) => (draft = { ...draft, [info.key]: value })"
            />
          </li>
        </ul>
      </div>
    </div>
    <div v-if="error || message" class="border-t border-border px-5 py-3">
      <Notice :tone="error ? 'error' : 'success'">{{ error ?? message }}</Notice>
    </div>
    </div>
  </section>
</template>
