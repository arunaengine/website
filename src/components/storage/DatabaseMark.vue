<script setup lang="ts">
// Mark a bucket as a database bucket, or take the mark off. The group that owns the bucket must agree.
import { computed, ref } from 'vue'
import DatabaseInfo from '@/components/data/DatabaseInfo.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { OWNING_GROUP } from '@/lib/distributedMockData'
import { Database } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()

const { all, add, agree, remove } = useMockDatabases()
const entry = computed(() => all.value.find((item) => item.bucket === props.bucket))
const group = computed(() => OWNING_GROUP[props.bucket] ?? 'the owning group')
const asking = ref(false)
const draft = ref({ description: '', source: '', license: '' })

function ask() {
  add({ ...draft.value, name: props.bucket, refresh: 'Off', readers: 'Everyone in the realm', bucket: props.bucket })
  asking.value = false
  draft.value = { description: '', source: '', license: '' }
}
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Database class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Database bucket</h2>
    </header>
    <div class="space-y-3 px-5 py-4 text-sm">
      <template v-if="entry?.status === 'agreed'">
        <DatabaseInfo :bucket="bucket" :heading="false" />
        <p class="text-xs text-muted-foreground">Group admins of {{ group }} can take the mark off. The bucket and its files stay as they are.</p>
        <Button size="sm" variant="outline" @click="remove(entry.id)">Remove the database bucket mark</Button>
      </template>
      <template v-else-if="entry">
        <Notice tone="warning" :title="`Waiting for the group admins of ${group}`">
          The mark takes effect when they agree. Until then this is an ordinary bucket.
        </Notice>
        <div class="flex gap-2">
          <Button size="sm" variant="outline" title="Mock: shows what happens when the group admins agree" @click="agree(entry.id)">Group admins agree</Button>
          <Button size="sm" variant="ghost" @click="remove(entry.id)">Cancel the request</Button>
        </div>
      </template>
      <template v-else>
        <p class="text-muted-foreground">
          This is an ordinary bucket. You hold the permission to mark buckets as database buckets through the role Database curators.
          The group that owns the bucket must agree.
        </p>
        <Button v-if="!asking" size="sm" variant="outline" @click="asking = true">Mark as database bucket</Button>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <Input v-model="draft.description" class="sm:col-span-2" placeholder="Short description" aria-label="Description" />
          <Input v-model="draft.source" placeholder="Source" aria-label="Source" />
          <Input v-model="draft.license" placeholder="License" aria-label="License" />
          <div class="flex gap-2 sm:col-span-2">
            <Button size="sm" @click="ask">Ask the group admins of {{ group }}</Button>
            <Button size="sm" variant="ghost" @click="asking = false">Cancel</Button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
