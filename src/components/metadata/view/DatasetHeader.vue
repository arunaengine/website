<script setup lang="ts">
// Hero for a resolved dataset: what it conforms to, what it is about, and the
// four facts every dataset carries.
import Badge from '@/components/ui/Badge.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import AuthorChips from '@/components/metadata/AuthorChips.vue'
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import { RouterLink } from 'vue-router'
import type { DatasetViewState } from '@/composables/useDatasetView'
import type { MetadataDoc } from '@/data/types'
import { isHttpUrl, relativeTime } from '@/lib/utils'
import { Layers, ListChecks } from '@lucide/vue'

const props = defineProps<{ doc: MetadataDoc; state: DatasetViewState }>()
const {
  currentCrate,
  currentProfile,
  conformsIris,
  conformsTitle,
  profileName,
  profileShortName,
  licenseLabel,
  projectCrate,
} = props.state
</script>

<template>
  <article class="surface p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1">
          <RouterLink v-if="currentProfile" :to="{ name: 'profile', params: { profileId: currentProfile.id } }" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:opacity-80">
            <ListChecks class="h-3 w-3" /> Reference: {{ currentProfile.name }}
          </RouterLink>
          <ExternalLink
            v-else-if="conformsIris.length === 1 && isHttpUrl(conformsIris[0])"
            :href="conformsIris[0]"
            :show-icon="false"
            class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]"
            :title="conformsTitle"
          >
            <ListChecks class="h-3 w-3" /> Reference: {{ profileName }}
          </ExternalLink>
          <span v-else class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary" :title="conformsTitle || undefined">
            <ListChecks class="h-3 w-3" /> Reference: {{ profileName }}
          </span>
          <ProfileChip :doc="doc" status-only />
        </div>
        <h2 class="mt-3 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ doc.title }}</h2>
        <p class="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">{{ doc.description || 'No description in RO-Crate summary.' }}</p>
        <div class="mt-4 flex flex-wrap gap-1.5">
          <span v-for="keyword in doc.keywords" :key="keyword" class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80">#{{ keyword }}</span>
        </div>
        <AuthorChips :crate="currentCrate" class="mt-4" />
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant="secondary">{{ relativeTime(doc.updatedAt) }}</Badge>
        <Badge v-if="projectCrate" variant="outline" size="sm" class="gap-1 uppercase"><Layers class="h-3 w-3" /> Project dataset</Badge>
      </div>
    </div>

    <dl class="mt-6 grid gap-3 sm:grid-cols-4">
      <div class="surface-muted p-3">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Dataset ID</dt>
        <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ doc.ulid }}</dd>
      </div>
      <div class="surface-muted p-3">
        <dt class="flex flex-wrap items-center gap-x-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Profile reference</span>
          <span class="normal-case tracking-normal">What is this?
            <RouterLink
              :to="{ name: 'docs', params: { topic: 'profiles-conformance' } }"
              class="font-medium text-primary hover:underline"
            >Learn more</RouterLink>
          </span>
        </dt>
        <dd class="mt-1 break-all text-sm font-medium text-foreground" :title="conformsTitle || undefined">{{ profileShortName }}</dd>
        <dd class="mt-2"><ProfileChip :doc="doc" status-only /></dd>
      </div>
      <div class="surface-muted p-3">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">License</dt>
        <dd class="mt-1 truncate text-sm">
          <ExternalLink v-if="doc.license && isHttpUrl(doc.license)" :href="doc.license" :label="licenseLabel" class="font-medium" :title="doc.license" />
          <span v-else-if="doc.license" class="font-medium text-foreground" :title="doc.license">{{ licenseLabel }}</span>
          <span v-else class="text-muted-foreground">Not set</span>
        </dd>
      </div>
      <div class="surface-muted p-3">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</dt>
        <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(doc.updatedAt) }}</dd>
      </div>
    </dl>
  </article>
</template>
