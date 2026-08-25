<script setup lang="ts">
// Header of every desktop view. The eyebrow names which side of the machine
// boundary the page is about, which is the one thing the portal header cannot
// say: "This computer" for local surfaces, the realm's name for shared ones.
withDefaults(defineProps<{ title: string; description?: string; eyebrow?: string }>(), {
  eyebrow: 'This computer',
})
</script>

<template>
  <header class="border-b border-border/70 bg-background/80 backdrop-blur">
    <div class="container flex flex-wrap items-end justify-between gap-3 pb-4 pt-5">
      <div class="min-w-0">
        <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{{ eyebrow }}</p>
        <div class="mt-1 flex flex-wrap items-baseline gap-2">
          <h1 class="font-display text-xl font-semibold tracking-tight text-aruna-navy">{{ title }}</h1>
          <slot name="title-suffix" />
        </div>
        <p v-if="description" class="mt-1 max-w-2xl text-[13px] text-muted-foreground">{{ description }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
    </div>
  </header>
</template>
