<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Popover from '@/components/ui/Popover.vue'
import { crateGraph, crateRootId, entityKind, typesOf } from '@/lib/dataEntities'
import { refId, toArray } from '@/lib/contextualEntities'
import { isArunaUserId, orcidOf } from '@/lib/identifiers'
import { Building2, ExternalLink, User as UserIcon } from '@lucide/vue'

// Renders the crate's author/creator/contributor references as chips with an
// info popover. A Person entity whose identifier carries an Aruna user id
// (`{ulid}@{realm-key}`) links to the in-portal user profile; an ORCID links
// out to orcid.org.
const props = defineProps<{ crate: unknown }>()

interface AuthorEntry {
  id: string
  name: string
  kind: 'person' | 'organization'
  role: 'author' | 'contributor'
  orcid?: string
  affiliation?: string
  email?: string
  userId?: string
}

function strings(value: unknown): string[] {
  return toArray(value).filter((v): v is string => typeof v === 'string')
}

const authors = computed<AuthorEntry[]>(() => {
  const graph = crateGraph(props.crate)
  if (!graph.length) return []
  const rootId = crateRootId(props.crate)
  const root = rootId ? graph.find((entity) => entity['@id'] === rootId) : undefined
  if (!root) return []
  const entries: AuthorEntry[] = []
  const seen = new Set<string>()
  const collect = (property: string, role: AuthorEntry['role']) => {
    for (const ref of toArray(root[property])) {
      const id = refId(ref)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const entity = graph.find((e) => e['@id'] === id)
      const name = typeof entity?.name === 'string' && entity.name ? entity.name : id
      const types = typesOf(entity)
      const identifiers = [id, ...strings(entity?.identifier)]
      const orcid = identifiers.map((v) => orcidOf(v)).find(Boolean)
      const userId = identifiers.find((v) => isArunaUserId(v))
      const affiliationRef = entity?.affiliation
      const affiliationId = refId(affiliationRef)
      const affiliation =
        typeof affiliationRef === 'string'
          ? affiliationRef
          : ((affiliationId && graph.find((e) => e['@id'] === affiliationId)?.name) as string | undefined)
      entries.push({
        id,
        name,
        role,
        kind: entityKind(types) === 'organizations' ? 'organization' : 'person',
        orcid,
        userId,
        affiliation: typeof affiliation === 'string' ? affiliation : undefined,
        email: typeof entity?.email === 'string' ? entity.email : undefined,
      })
    }
  }
  collect('author', 'author')
  collect('creator', 'author')
  collect('contributor', 'contributor')
  return entries
})
</script>

<template>
  <div v-if="authors.length" class="flex flex-wrap items-center gap-1.5">
    <span class="text-[11px] uppercase tracking-wider text-muted-foreground">Authors</span>
    <Popover v-for="author in authors" :key="author.id">
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/90 transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Building2 v-if="author.kind === 'organization'" class="h-3 w-3 text-primary/70" />
        <UserIcon v-else class="h-3 w-3 text-primary/70" />
        {{ author.name }}
        <span v-if="author.role === 'contributor'" class="text-muted-foreground">(contributor)</span>
      </button>
      <template #content>
        <div class="space-y-1.5">
          <div class="text-sm font-semibold text-foreground">{{ author.name }}</div>
          <div v-if="author.affiliation" class="text-xs text-muted-foreground">{{ author.affiliation }}</div>
          <div v-if="author.email" class="text-xs text-muted-foreground">{{ author.email }}</div>
          <a
            v-if="author.orcid"
            :href="`https://orcid.org/${author.orcid}`"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            ORCID {{ author.orcid }} <ExternalLink class="h-3 w-3" />
          </a>
          <RouterLink
            v-if="author.userId"
            :to="{ name: 'user-profile', params: { id: author.userId } }"
            class="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View portal profile →
          </RouterLink>
          <div v-if="!author.affiliation && !author.email && !author.orcid && !author.userId" class="text-xs text-muted-foreground">
            No further details in this crate.
          </div>
        </div>
      </template>
    </Popover>
  </div>
</template>
