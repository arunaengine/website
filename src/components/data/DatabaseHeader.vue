<script setup lang="ts">
// The card above the files of every bucket: a database names its title and release, a synced
// bucket its partners, any other bucket its name. The facts line comes from the slot.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import InfoHint from '@/components/ui/InfoHint.vue'
import { useDatabases } from '@/composables/useDatabases'
import { cn, isHttpUrl } from '@/lib/utils'
import { Database, ExternalLink, FileText, FolderSync, Package, Scale } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    bucket: string
    nodeId: string | null
    /** The set of a bucket of this node; null for an ordinary one, undefined while it is not known. */
    setId?: string | null
    bare?: boolean
    /** The nodes this bucket syncs with, linked in the title. */
    syncedWith?: { id: string; name: string }[]
  }>(),
  { setId: undefined, syncedWith: () => [] },
)

const databases = useDatabases()
onMounted(() => databases.ensure())

const entry = computed(() => databases.find(props.bucket, props.nodeId, props.setId))
const title = computed(() => {
  const name = entry.value?.title || 'Database'
  const version = entry.value?.metadata.version
  return version ? `${name}, release ${version}` : name
})
const description = computed(() => entry.value?.metadata.description ?? '')
const license = computed(() => entry.value?.metadata.license ?? '')
</script>

<template>
  <section :class="cn('flex flex-wrap items-center gap-x-4 gap-y-2', bare ? '' : 'surface p-4')">
    <IconTile :icon="entry ? Database : syncedWith.length ? FolderSync : Package" :tone="entry ? 'royal' : syncedWith.length ? 'aqua' : 'muted'" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
        <template v-if="entry">{{ title }}</template>
        <template v-else-if="syncedWith.length">
          Synced with
          <template v-for="(partner, index) in syncedWith" :key="partner.id"><template v-if="index">, </template><RouterLink :to="{ name: 'node', params: { nodeId: partner.id } }" class="text-primary hover:underline">{{ partner.name }}</RouterLink></template>
        </template>
        <template v-else>{{ bucket }}</template>
      </p>
      <!-- One line; the whole description is behind the hint. -->
      <p v-if="description" class="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <span class="truncate">{{ description }}</span>
        <InfoHint :label="description" name="About this database" />
      </p>
      <p v-if="$slots.default || entry?.public" class="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <slot />
        <span v-if="entry?.public">Public</span>
      </p>
    </div>
    <div v-if="license || entry?.datasetId" class="flex flex-wrap items-center gap-2">
      <Button v-if="license && isHttpUrl(license)" size="sm" variant="outline" as-child>
        <a :href="license" target="_blank" rel="noopener noreferrer" aria-label="Open the license"><Scale class="h-4 w-4" /> License <ExternalLink class="h-3.5 w-3.5" /></a>
      </Button>
      <span v-else-if="license" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Scale class="h-3.5 w-3.5" aria-hidden="true" />{{ license }}</span>
      <Button v-if="entry?.datasetId" size="sm" variant="outline" as-child>
        <RouterLink :to="{ name: 'dataset', params: { id: entry.datasetId } }"><FileText class="h-4 w-4" /> Open the dataset</RouterLink>
      </Button>
    </div>
  </section>
</template>
