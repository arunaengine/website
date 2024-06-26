<script setup lang="ts">
import {IconArrowBigLeftLines, IconArrowBigRightLines, IconCloudDown, IconLink} from '@tabler/icons-vue';
import {type EndpointInfo} from '~/composables/api_wrapper';

const props = defineProps<{
  endpoints: EndpointInfo[] | undefined
}>()
</script>

<template>
  <div class="-m-1.5 overflow-x-auto">
    <div class="p-1.5 min-w-full inline-block align-middle">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
          <tr>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-500 uppercase">
              ID
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-500 uppercase">
              Status
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-gray-500 uppercase">
              Download
            </th>
          </tr>
          </thead>

          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <tr v-for="endpoint in props.endpoints" class="hover:bg-gray-100 dark:hover:bg-gray-700">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ endpoint.id }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ endpoint.status }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-200">
                <button
                    type="button"
                    title="Download Object"
                    class="inline-flex grow justify-center font-semibold rounded-lg border border-transparent text-gray-600 dark:text-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none">
                    <!-- @click="downloadResource(endpoint.id)" -->
                    <IconCloudDown class="flex-shrink-0"/>
                </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>