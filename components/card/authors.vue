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
        <table class="min-w-full divide-y divide-gray-500">
          <thead>
          <tr>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-400 uppercase">Name</th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-400 uppercase">Email</th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-400 uppercase">ORCID</th>
          </tr>
          </thead>
          <tbody class="divide-y divide-gray-600">
          <tr v-for="author in getAuthors()" class="hover:bg-gray-700">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-300">
              {{ author.firstName }} {{ author.lastName }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-300">
              <a class="text-aruna-700 hover:text-aruna-800" :href="`mailto:${author.email}`">{{ author.email }}</a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
              <a v-if="author.orcid" class="inline-flex items-center text-green-700 hover:text-green-600"
                 :href="`https://orcid.org/${author.orcid}`" target="_blank">
                <img :title="author.orcid" alt="orcid-icon" src="assets/imgs/ORCIDiD_icon24x24.png"/>
              </a>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>