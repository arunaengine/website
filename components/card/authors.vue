<script setup lang="ts">
import {IconCheck} from '@tabler/icons-vue'
import {IconTags} from '@tabler/icons-vue'
import {v2KeyValueVariant, type v2KeyValue, type v2Author} from '~/composables/aruna_api_json'

const props = defineProps<{
  authors: v2Author[] | undefined
}>()

function getAuthors() {
  return props.authors ? props.authors : []
}
</script>

<template>
  <div class="-m-1.5 overflow-x-auto">
    <div class="p-1.5 min-w-full inline-block align-middle">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
          <tr>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-500 uppercase">Name</th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-500 uppercase">Email</th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-500 uppercase">ORCID</th>
          </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <tr v-for="author in getAuthors()" class="hover:bg-gray-100 dark:hover:bg-gray-700">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
              <!-- <a href=format!( "/search?filter_key={}&filter_value={}" , key.clone(), value.clone(), ) exact=true class=""></a> -->
              {{ author.firstName }} {{ author.lastName }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
              <a :href="`mailto:${author.email}`">{{ author.email }}</a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
              <a v-if="author.orcid" :href="`https://:orcid.org/${author.orcid}`" target="_blank">{{ author.orcid }}</a>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>