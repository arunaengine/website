<script setup lang="ts">
// Identity of one run: a tile, its name with its state, and one line on what ran.
import { computed } from 'vue'
import { Workflow } from '@lucide/vue'
import IconTile from '@/components/ui/IconTile.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { TES_STATE_META, type TesState } from '@/lib/tes'

const props = withDefaults(defineProps<{ title: string; state?: TesState; subtitle?: string }>(), {
  state: undefined,
  subtitle: '',
})

const label = computed(() => TES_STATE_META[props.state ?? 'UNKNOWN'].label)
</script>

<template>
  <div class="flex min-w-0 items-start gap-3">
    <IconTile :icon="Workflow" />
    <div class="min-w-0 flex-1">
      <h2 class="type-section-title break-words">
        {{ title }}
        <span class="ml-1 inline-flex align-[-2px]">
          <StatusMark
            v-if="state === 'COMPLETE' || state === 'EXECUTOR_ERROR' || state === 'SYSTEM_ERROR'"
            :failed="state !== 'COMPLETE'"
            :label="label"
          />
          <StatusPill v-else :state="label" />
        </span>
      </h2>
      <p v-if="subtitle" class="mt-1 break-words text-[13px] leading-[18px] text-muted-foreground">{{ subtitle }}</p>
    </div>
  </div>
</template>
