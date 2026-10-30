<script setup lang="ts">
// The card above the files of every bucket: a database names its dataset's title, version,
// description, license and identifiers; a synced bucket its partners, any other bucket its name.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import ExternalLinkText from '@/components/ui/ExternalLink.vue'
import IconTile from '@/components/ui/IconTile.vue'
import InfoHint from '@/components/ui/InfoHint.vue'
import { useDatabases } from '@/composables/useDatabases'
import { identifierUrl } from '@/lib/databases'
import { licenseText, licenseUrl } from '@/lib/licenses'
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
// Everything but the flag, the rules and the dataset link comes from the linked dataset.
const described = computed(() => entry.value?.description ?? null)
const title = computed(() => {
  const name = entry.value?.title || entry.value?.bucket || 'Database'
  const version = described.value?.version
  return version ? `${name}, version ${version}` : name
})
const description = computed(() => described.value?.description ?? '')
// An SPDX id reads as its license page, so every license is a link.
const license = computed(() => licenseUrl(described.value?.license ?? ''))
const identifiers = computed(() => (described.value?.identifiers ?? []).map((item) => ({ ...item, url: identifierUrl(item) })))
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
      <p v-if="$slots.default || entry?.public || identifiers.length" class="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <slot />
        <span v-if="entry?.public">Public</span>
        <span v-for="item in identifiers" :key="`${item.name}:${item.value}`">{{ item.name }} <ExternalLinkText :href="item.url" :label="item.value" class="font-mono" /></span>
      </p>
    </div>
    <div v-if="license || entry?.datasetId" class="flex flex-wrap items-center gap-2">
      <Button v-if="license && isHttpUrl(license)" size="sm" variant="outline" as-child>
        <a :href="license" target="_blank" rel="noopener noreferrer" :aria-label="`Open the license ${licenseText(license)}`"><Scale class="h-4 w-4" /> {{ licenseText(license) }} <ExternalLink class="h-3.5 w-3.5" /></a>
      </Button>
      <span v-else-if="license" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Scale class="h-3.5 w-3.5" aria-hidden="true" />{{ licenseText(license) }}</span>
      <Button v-if="entry?.datasetId" size="sm" variant="outline" as-child>
        <RouterLink :to="{ name: 'dataset', params: { id: entry.datasetId } }"><FileText class="h-4 w-4" /> Open the dataset</RouterLink>
      </Button>
    </div>
  </section>
</template>
