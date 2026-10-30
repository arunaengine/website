<script setup lang="ts">
// Presets: the values the dataset editor offers ready made. The portal ships them built in, the
// same for every group; saved people, organizations and places are not offered by the node yet.
import PageHeader from '@/components/dashboard/PageHeader.vue'
import { VALUE_PRESETS } from '@/lib/crate/editor'

const TYPE_LABELS: Record<string, string> = { license: 'License' }
const rows = Object.entries(VALUE_PRESETS).flatMap(([property, presets]) =>
  presets.map((preset) => ({ ...preset, type: TYPE_LABELS[property] ?? property })),
)
</script>

<template>
  <div>
    <PageHeader title="Presets" :crumbs="[{ label: 'Presets' }]" :docs="{ topic: 'datasets' }" />
    <div class="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6">
      <p class="text-sm text-muted-foreground">Ready-made values the dataset editor offers. Datasets refer to them by their @id.</p>
      <div class="surface overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th class="px-4 py-2 font-medium">Name</th>
              <th class="px-4 py-2 font-medium">Type</th>
              <th class="px-4 py-2 font-medium">Scope</th>
              <th class="px-4 py-2 font-medium">@id</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.value" class="border-b border-border-subtle last:border-0">
              <td class="px-4 py-2.5 font-medium">{{ row.label }}</td>
              <td class="px-4 py-2.5">{{ row.type }}</td>
              <td class="px-4 py-2.5">Built in</td>
              <td class="max-w-0 px-4 py-2.5"><a :href="row.value" target="_blank" rel="noopener noreferrer" class="block truncate text-primary hover:underline" :title="row.value">{{ row.value }}</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
