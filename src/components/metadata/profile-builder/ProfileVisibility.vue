<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { Globe, Users } from '@lucide/vue'
import { GROUP_PROFILE_HINT } from '@/lib/profiles/assignable'
import type { ProfileBuilder } from './useProfileBuilder'

// The one place a profile's reach is chosen: the basics step edits it, the
// review step shows the same wording read-only with a way back.
const props = defineProps<{ builder: ProfileBuilder; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'change'): void }>()
const builder = props.builder

const PUBLIC_HINT = 'Its files are published to the group bucket, and any dataset in the realm may declare it.'
const OPTIONS = [
  { value: false, label: 'Group only', hint: GROUP_PROFILE_HINT, icon: Users },
  { value: true, label: 'Public, registered for datasets', hint: PUBLIC_HINT, icon: Globe },
] as const

const TOOLTIP = 'Public profiles are registered so any dataset can be validated against them. A group-only profile stays with its group.'
</script>

<template>
  <div data-tour="profile-visibility">
    <div class="flex items-center gap-2">
      <Tooltip :label="TOOLTIP">
        <span class="text-xs font-medium text-foreground">Visibility</span>
      </Tooltip>
      <Badge v-if="readonly" size="sm" :variant="builder.isPublic ? 'royal' : 'secondary'">
        {{ builder.isPublic ? 'Public, registered for datasets' : 'Group only' }}
      </Badge>
      <Button v-if="readonly" variant="ghost" size="sm" @click="emit('change')">Change</Button>
    </div>

    <p v-if="readonly" class="mt-1 text-[11px] text-muted-foreground">
      {{ builder.isPublic ? PUBLIC_HINT : GROUP_PROFILE_HINT }}
    </p>

    <div v-else role="radiogroup" aria-label="Visibility" class="mt-1 grid gap-2 sm:grid-cols-2">
      <button
        v-for="option in OPTIONS"
        :key="String(option.value)"
        type="button"
        role="radio"
        :aria-checked="builder.isPublic === option.value"
        class="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
        :class="builder.isPublic === option.value ? 'border-primary bg-primary/5' : 'border-border'"
        @click="builder.isPublic = option.value"
      >
        <span class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <component :is="option.icon" class="h-3.5 w-3.5 text-primary/70" />
          {{ option.label }}
        </span>
        <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ option.hint }}</span>
      </button>
    </div>
  </div>
</template>
