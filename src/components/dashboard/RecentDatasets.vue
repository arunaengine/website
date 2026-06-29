<script setup lang="ts">
import { useRealm } from '@/composables/useRealm'
import Badge from '@/components/ui/Badge.vue'
import { RouterLink } from 'vue-router'
import { relativeTime } from '@/lib/utils'
import { ArrowRight, FileJson2 } from '@lucide/vue'
import { computed } from 'vue'

const { metadata } = useRealm()
const recent = computed(() =>
  metadata.value
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6),
)
</script>

<template>
  <div class="surface">
    <header
      class="flex items-center justify-between border-b border-border px-5 py-4"
    >
      <div>
        <h3 class="font-display text-sm font-semibold text-aruna-navy">
          Recently updated datasets
        </h3>
        <p class="text-xs text-muted-foreground">
          Latest RO-Crate documents in this realm.
        </p>
      </div>
      <RouterLink
        to="/app/metadata"
        class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Open catalog <ArrowRight class="h-3 w-3" />
      </RouterLink>
    </header>
    <ul class="divide-y divide-border">
      <li v-for="m in recent" :key="m.ulid">
        <RouterLink
          :to="{ name: 'metadata-detail', params: { id: m.ulid } }"
          class="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
        >
          <FileJson2 class="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium text-foreground">
                {{ m.title }}
              </span>
              <Badge variant="outline" class="border-primary/30 text-primary">
                v{{ m.currentVersion }}
              </Badge>
            </div>
            <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
              {{ m.author }} · {{ m.organization }} ·
              {{ relativeTime(m.updatedAt) }}
            </div>
          </div>
          <div class="hidden shrink-0 text-right text-[11px] text-muted-foreground md:block">
            <div>{{ m.linkedObjects.length }} files</div>
            <div class="font-mono">ulid:{{ m.ulid.slice(0, 6) }}…</div>
          </div>
        </RouterLink>
      </li>
      <li v-if="!recent.length" class="px-5 py-6 text-center text-xs text-muted-foreground">
        No datasets yet.
      </li>
    </ul>
  </div>
</template>
