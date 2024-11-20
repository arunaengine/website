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
        <table class="min-w-full divide-y divide-aruna-text/50">
          <thead>
          <tr>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">Name</th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">Email</th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">ORCID</th>
          </tr>
          </thead>
          <tbody class="divide-y divide-aruna-text/50">
          <tr v-for="author in getAuthors()" class="hover:bg-aruna-fg">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              {{ author.firstName }} {{ author.lastName }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <a class="text-aruna-highlight hover:text-aruna-highlight/80" :href="`mailto:${author.email}`">{{ author.email }}</a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
              <a v-if="author.orcid" class="inline-flex items-center text-green-700 hover:text-green-600"
                 :href="`https://orcid.org/${author.orcid}`" target="_blank">
                <img src="/imgs/ORCIDiD_icon24x24.png"
                     :title="author.orcid"
                     alt="orcid-icon"/>
              </a>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>