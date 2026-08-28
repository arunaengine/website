<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { displayName, findEntity, typeLabel, type CrateDraft } from '@/lib/crate/editor'
import { ArrowRight } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; value: string; label: string; locked?: boolean }>()
const emit = defineEmits<{
  (e: 'update:value', value: string): void
  (e: 'select', entityId: string): void
}>()

const target = computed(() => findEntity(props.draft, props.value))
</script>

<template>
  <div
    v-if="target"
    class="flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5"
  >
    <span class="min-w-0 flex-1 truncate text-sm text-foreground">{{ displayName(target) }}</span>
    <Badge variant="secondary" size="sm">{{ target.types.map(typeLabel).join(', ') }}</Badge>
    <Button
      variant="ghost"
      size="icon-sm"
      :aria-label="`Open ${displayName(target)}`"
      @click="emit('select', target.id)"
    >
      <ArrowRight class="h-3.5 w-3.5" />
    </Button>
  </div>
  <p
    v-else-if="locked"
    class="flex h-9 min-w-0 items-center truncate rounded-md border border-dashed border-border px-2.5 font-mono text-xs text-muted-foreground"
  >
    {{ value }}
  </p>
  <Input
    v-else
    :model-value="value"
    :aria-label="label"
    placeholder="https://example.org/thing"
    @update:model-value="(next: string | number) => emit('update:value', String(next))"
  />
</template>
