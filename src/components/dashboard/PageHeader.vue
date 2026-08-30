<script setup lang="ts">
import RealmBadge from '@/components/ui/RealmBadge.vue'
import { useRealm } from '@/composables/useRealm'
import { cn } from '@/lib/utils'

// `eyebrow` names which surface the page belongs to: the portal, or the
// computer Aruna Desktop runs on.
withDefaults(
  defineProps<{
    title: string
    description?: string
    eyebrow?: string
    class?: string
  }>(),
  { eyebrow: 'Portal' },
)

const { realm } = useRealm()
</script>

<template>
  <header
    :class="
      cn('relative overflow-hidden border-b border-border/80 bg-background/70 backdrop-blur', $props.class)
    "
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aruna-aqua/60 to-transparent" />
    <div class="container flex flex-col gap-3 pb-5 pt-6">
      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span class="eyebrow">{{ eyebrow }}</span>
        <span>·</span>
        <RealmBadge :realm="realm" />
        <slot name="breadcrumbs" />
      </div>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="font-display text-2xl font-semibold tracking-tight text-aruna-navy md:text-[28px]">
            {{ title }}
          </h1>
          <p v-if="description || $slots.description" class="mt-1 max-w-2xl text-sm text-muted-foreground">
            <slot name="description">{{ description }}</slot>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>
