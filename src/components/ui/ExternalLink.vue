<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import type { ClassValue } from 'clsx'
import { ExternalLink as ExternalLinkIcon } from '@lucide/vue'
import { cn, isHttpUrl } from '@/lib/utils'

// The single place the app turns a raw URI value into a clickable link. An
// absolute http(s) value renders as an anchor that opens safely in a new tab;
// anything else (bare identifiers, ORCIDs without a scheme, unsafe schemes like
// javascript:/data:/mailto:, empty) falls back to plain text. A parent-supplied
// class is merged (twMerge), so the colour can be toned down to muted where the
// surrounding text is muted; the default matches the app's link styling.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    // Raw URI value; only absolute http(s) URLs become a link.
    href?: string | null
    // Visible text; defaults to the href value.
    label?: string | null
    // Show the small trailing external-link glyph on links.
    showIcon?: boolean
  }>(),
  { href: '', label: null, showIcon: true },
)

const attrs = useAttrs()
// Forward fallthrough attributes (title, aria-*, …) but merge class ourselves so
// a parent override wins over the default link colour.
const passThrough = computed(() => {
  const { class: _class, ...rest } = attrs
  return rest
})
const linkable = computed(() => isHttpUrl(props.href))
const text = computed(() => props.label ?? props.href ?? '')
const rootClass = computed(() =>
  cn(
    linkable.value ? 'inline-flex max-w-full items-center gap-1 text-primary hover:underline' : '',
    attrs.class as ClassValue,
  ),
)
</script>

<template>
  <a
    v-if="linkable"
    v-bind="passThrough"
    :href="href ?? undefined"
    target="_blank"
    rel="noopener noreferrer"
    :class="rootClass"
  >
    <slot>{{ text }}</slot>
    <ExternalLinkIcon v-if="showIcon" class="h-3 w-3 shrink-0" aria-hidden="true" />
  </a>
  <span v-else v-bind="passThrough" :class="rootClass"><slot>{{ text }}</slot></span>
</template>
