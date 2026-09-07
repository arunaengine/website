<script setup lang="ts">
// A stored HTML file, shown as it reads. The markup is stripped of scripts and
// of anything pointing off the page first, and the frame it renders in is
// sandboxed with a policy that allows inline images and nothing else.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import { safeHtmlDocument } from '@/lib/htmlDocument'
import { Code, Eye, Maximize2, Minimize2 } from '@lucide/vue'

const props = defineProps<{ text: string; name: string; theme?: 'light' | 'dark'; compact?: boolean }>()

const safe = computed(() => safeHtmlDocument(props.text, props.theme))
const source = ref(false)
const expanded = ref(false)
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p v-if="!compact || safe.removed || safe.truncated" class="text-[11px] text-muted-foreground">
        Shown without scripts and without anything it loads from elsewhere.
        <span v-if="safe.removed">{{ safe.removed }} {{ safe.removed === 1 ? 'part was' : 'parts were' }} left out.</span>
        <span v-if="safe.truncated">The file is too large to show whole.</span>
      </p>
      <span v-else class="text-xs font-medium text-muted-foreground">HTML output</span>
      <div class="flex items-center gap-1">
      <Button v-if="compact && !source" variant="ghost" size="sm" :aria-label="expanded ? 'Collapse output' : 'Expand output'" @click="expanded = !expanded">
        <component :is="expanded ? Minimize2 : Maximize2" class="h-4 w-4" />
      </Button>
      <Button :variant="compact ? 'ghost' : 'outline'" size="sm" class="shrink-0" @click="source = !source">
        <component :is="source ? Eye : Code" class="h-4 w-4" />
        {{ source ? 'Show the page' : 'Show the source' }}
      </Button>
      </div>
    </div>

    <pre
      v-if="source"
      class="scrollbar-thin max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed"
    >{{ props.text }}</pre>
    <iframe
      v-else
      :srcdoc="safe.html"
      :title="`${props.name} as a page`"
      sandbox=""
      referrerpolicy="no-referrer"
      class="w-full rounded-md border border-border"
      :class="compact ? (expanded ? 'h-[60vh] bg-transparent' : 'h-48 bg-transparent') : 'h-[60vh] bg-white'"
    />
  </div>
</template>
