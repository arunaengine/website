<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { entityIcon } from './icons'
import { displayName, findEntity, rootId, typeLabel, type CrateDraft } from '@/lib/crate/editor'
import { isHttpUrl, truncateMiddle } from '@/lib/utils'
import { ExternalLink, Link2, Plus } from '@lucide/vue'

// A reference is one of four things: nothing yet, an entity of this crate, a
// URL outside it, or an identifier nothing answers to.
const props = defineProps<{ draft: CrateDraft; value: string; label: string; locked?: boolean }>()
const emit = defineEmits<{
  (e: 'select', entityId: string): void
  (e: 'create'): void
  (e: 'link'): void
}>()

const target = computed(() => findEntity(props.draft, props.value))
const external = computed(() => !target.value && isHttpUrl(props.value))
const unresolved = computed(() => Boolean(props.value.trim()) && !target.value && !external.value)
const icon = computed(() => entityIcon(target.value, target.value?.id === rootId(props.draft)))
</script>

<template>
  <p
    v-if="locked"
    class="flex h-9 min-w-0 items-center gap-2 truncate rounded-md border border-dashed border-border px-2.5 text-sm"
  >
    <component :is="icon" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <span class="min-w-0 flex-1 truncate">{{ target ? displayName(target) : value }}</span>
  </p>

  <div v-else-if="!value.trim()" class="flex items-center gap-2">
    <Button variant="outline" size="sm" :aria-label="`Create a ${label}`" @click="emit('create')">
      <Plus class="h-3.5 w-3.5" /> Create
    </Button>
    <Button variant="outline" size="sm" :aria-label="`Link a ${label}`" @click="emit('link')">
      <Link2 class="h-3.5 w-3.5" /> Link
    </Button>
  </div>

  <div v-else class="flex min-w-0 items-center gap-1">
    <button
      v-if="target"
      type="button"
      class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 text-left hover:bg-muted/60"
      :title="value"
      @click="emit('select', target.id)"
    >
      <component :is="icon" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-sm text-foreground">{{ displayName(target) }}</span>
      <Badge variant="secondary" size="sm">{{ target.types.map(typeLabel).join(', ') }}</Badge>
    </button>
    <a
      v-else-if="external"
      :href="value"
      target="_blank"
      rel="noreferrer"
      class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 hover:bg-muted/60"
      :title="value"
    >
      <ExternalLink class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-sm text-foreground">{{ value }}</span>
    </a>
    <p
      v-else
      class="flex h-9 min-w-0 flex-1 items-center rounded-md border border-dashed border-destructive/50 px-2.5 font-mono text-xs text-muted-foreground"
      :title="value"
    >
      {{ truncateMiddle(value, 24, 12) }}
    </p>

    <Button
      v-if="unresolved"
      variant="ghost"
      size="icon-sm"
      :aria-label="`Create the missing ${label}`"
      @click="emit('create')"
    >
      <Plus class="h-3.5 w-3.5" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      :aria-label="`Change the ${label} link`"
      @click="emit('link')"
    >
      <Link2 class="h-3.5 w-3.5" />
    </Button>
  </div>
</template>
