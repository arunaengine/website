<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { orcidOf, rorOf } from '@/lib/identifiers'
import { isHttpUrl } from '@/lib/utils'
import type { ContextualEntity } from '@/lib/contextualEntities'
import { Building2, User } from '@lucide/vue'

// Fixed three-slot layout (identity / context / identifiers): the context line
// keeps a minimum height even when empty so the identifier row aligns across
// every card of a grid. Non-HTTP ids never link; they live in the name tooltip.
const props = defineProps<{
  entity: ContextualEntity
  kind: 'people' | 'organizations'
  highlight?: boolean
}>()
const emit = defineEmits<{ (e: 'jump', id: string): void }>()

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const contextText = computed(() => {
  const entity = props.entity
  if (entity.address) return entity.address
  if (entity.url) return hostOf(entity.url)
  if (entity.description) return entity.description
  return ''
})

// The @id renders as its own link chip only when no detection covers it yet.
const idLink = computed(() => {
  const id = props.entity.id
  if (!isHttpUrl(id) || orcidOf(id) || rorOf(id)) return undefined
  return id
})
</script>

<template>
  <div
    :id="`ctx-${entity.id}`"
    class="surface-muted flex scroll-mt-4 flex-col gap-1 p-3"
    :class="highlight ? 'ring-2 ring-primary/40' : ''"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <component :is="kind === 'people' ? User : Building2" class="h-3.5 w-3.5 shrink-0 text-primary/70" />
      <span class="min-w-0 truncate text-sm font-medium text-foreground" :title="entity.id">{{ entity.name }}</span>
      <span v-if="entity.version" class="shrink-0 text-xs text-muted-foreground">{{ entity.version }}</span>
      <span v-if="entity.roles.length" class="ml-auto flex shrink-0 gap-1">
        <Badge v-for="role in entity.roles" :key="role" variant="outline" size="sm" class="uppercase">{{ role }}</Badge>
      </span>
    </div>

    <div class="min-h-[1rem] truncate text-xs text-muted-foreground">
      <template v-if="entity.affiliations.length">
        <template v-for="(affiliation, i) in entity.affiliations" :key="affiliation.name">
          <button
            v-if="affiliation.id"
            type="button"
            class="hover:text-primary hover:underline"
            :title="affiliation.id"
            @click="emit('jump', affiliation.id)"
          >{{ affiliation.name }}</button>
          <span v-else>{{ affiliation.name }}</span><span v-if="i < entity.affiliations.length - 1">, </span>
        </template>
      </template>
      <template v-else-if="contextText">{{ contextText }}</template>
      <span v-else-if="entity.unresolved" class="italic">Referenced but not described in this dataset</span>
    </div>

    <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
      <ExternalLink v-if="entity.orcid" :href="`https://orcid.org/${entity.orcid}`" label="ORCID" :title="`https://orcid.org/${entity.orcid}`" />
      <ExternalLink v-if="entity.ror" :href="`https://ror.org/${entity.ror}`" label="ROR" :title="`https://ror.org/${entity.ror}`" />
      <a
        v-if="entity.email"
        :href="`mailto:${entity.email}`"
        class="max-w-full truncate text-primary hover:underline"
        :title="entity.email"
      >{{ entity.email }}</a>
      <RouterLink
        v-if="entity.userId"
        :to="{ name: 'user', params: { id: entity.userId } }"
        class="font-medium text-primary hover:underline"
      >
        Portal profile
      </RouterLink>
      <ExternalLink v-if="idLink" :href="idLink" :label="hostOf(idLink)" :title="entity.id" />
    </div>
  </div>
</template>
