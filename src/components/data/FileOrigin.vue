<script setup lang="ts">
// Where a file version came from, as the node recorded it when the version was made. A sync adds
// the version it copied from. The ids and what a dataset may say about the file wait in Details.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import OriginLine from '@/components/data/OriginLine.vue'
import GlobalId from '@/components/distributed/GlobalId.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useFileOrigin, type OriginTarget } from '@/composables/useFileOrigin'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import { hopFrom, originFrom, projectionRows } from '@/lib/fileOrigin'
import { shortUserId, truncateMiddle } from '@/lib/utils'

const props = defineProps<{ target: OriginTarget }>()

const { displayName } = useRealmNodes()
const s3 = useS3()
const databases = useDatabases()
const found = useFileOrigin(computed(() => props.target))

const origin = computed(() =>
  found.origin.value
    ? originFrom(found.origin.value, {
        user: shortUserId,
        node: displayName,
        database: (entryId) => {
          const row = databases.rows.value.find((item) => item.entryId === entryId)
          return row ? row.title || row.bucket : null
        },
        backend: (id) => truncateMiddle(id, 8, 4),
      })
    : null,
)
const hop = computed(() => (found.origin.value ? hopFrom(found.origin.value) : null))
const rows = computed(() => projectionRows(found.origin.value?.projection ?? []))
// The version downloads through this session's short-lived signed URL, never with the token in a URL.
const downloadError = ref<string | null>(null)
async function download() {
  const version = found.origin.value?.version_id
  if (!version) return
  downloadError.value = null
  try {
    const name = props.target.key.split('/').pop() || props.target.key
    const anchor = document.createElement('a')
    anchor.href = await s3.downloadUrl(props.target.bucket, props.target.key, null, version, name)
    anchor.download = name
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } catch (cause) {
    downloadError.value = s3ErrorMessage(cause)
  }
}
// A version minted without a record is said so, never guessed.
const recorded = computed(() => Boolean(origin.value || hop.value))
</script>

<template>
  <section v-if="found.state.value !== 'missing'" class="space-y-2 border-t border-border pt-4">
    <h3 class="text-sm font-medium text-foreground">Origin</h3>
    <Spinner v-if="found.state.value === 'loading'" label="Reading the origin" />
    <p v-else-if="found.state.value === 'failed'" class="text-xs text-muted-foreground">The origin could not be read: {{ found.error.value }}</p>
    <template v-else>
      <div class="space-y-0.5 text-xs">
        <OriginLine v-if="origin" short :origin="origin" />
        <OriginLine v-if="hop" short :origin="hop" />
        <p v-if="!recorded" class="text-muted-foreground">Not recorded for this version.</p>
      </div>
      <div v-if="found.origin.value?.global_id" class="space-y-1.5 text-xs">
        <p class="text-muted-foreground">
          Id of this version. It names no node: the URL downloads the file from a holder that the node chooses.
          Send your token with the request unless the file is public.
        </p>
        <GlobalId :global-url="found.origin.value.global_id" />
        <button type="button" class="text-primary hover:underline" @click="download">Download this version</button>
        <p v-if="downloadError" class="text-destructive">{{ downloadError }}</p>
      </div>
      <details v-if="recorded" class="border-t border-border pt-3 text-xs">
        <summary class="cursor-pointer text-sm font-medium text-foreground">Details</summary>
        <div class="mt-3 space-y-4">
          <div v-if="origin" class="space-y-0.5">
            <p class="mb-1 text-muted-foreground">Origin</p>
            <OriginLine :origin="origin" />
            <OriginLine v-if="hop" :origin="hop" />
          </div>
          <div>
            <p class="mb-1 text-muted-foreground">Added to datasets as</p>
            <ul v-if="rows.length" class="space-y-1">
              <li v-for="row in rows" :key="row.key" class="flex items-center gap-2">
                <template v-if="row.property === 'CreateAction'">
                  <span class="min-w-0 flex-1">
                    Produced by the run
                    <RouterLink :to="{ name: 'compute', query: { tab: 'jobs' } }" class="font-mono text-primary hover:underline">{{ row.value }}</RouterLink>
                  </span>
                </template>
                <template v-else>
                  <span class="shrink-0 text-muted-foreground">isBasedOn</span>
                  <span class="min-w-0 flex-1 break-all font-mono">{{ row.value }}</span>
                </template>
              </li>
            </ul>
            <p v-else class="text-muted-foreground">Nothing: uploads, storage folders and users stay out of datasets.</p>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
