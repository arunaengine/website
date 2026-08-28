<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { displayName, findEntity, type CrateDraft } from '@/lib/crate/editor'
import { ArrowRight } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; value: string; label: string }>()
const emit = defineEmits<{
  (e: 'update:value', value: string): void
  (e: 'jump', entityId: string): void
}>()

const target = computed(() => findEntity(props.draft, props.value))
</script>

<template>
  <div v-if="target" class="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
    <span class="min-w-0 flex-1 truncate text-sm text-foreground">{{ displayName(target) }}</span>
    <Badge variant="secondary" size="sm">{{ target.types.join(', ') }}</Badge>
    <Button
      variant="ghost"
      size="icon-sm"
      :aria-label="`Go to ${displayName(target)}`"
      @click="emit('jump', target.id)"
    >
      <ArrowRight class="h-3.5 w-3.5" />
    </Button>
  </div>
  <Input
    v-else
    :model-value="value"
    :aria-label="label"
    placeholder="https://example.org/thing"
    @update:model-value="(next: string | number) => emit('update:value', String(next))"
  />
</template>
