<script lang="ts" setup>
import {IconCircleCheck, IconExternalLink, IconX} from "@tabler/icons-vue";
import type {v2Collection, v2Dataset, v2Object, v2Project} from "~/composables/aruna_api_json";

const props = defineProps<{
  modalId: string,
  object: v2Project | v2Collection | v2Dataset | v2Object | undefined,
  progress: number,
  errorMsg: string | undefined
}>()

const object = toRef(props, 'object')
const progress = toRef(props, 'progress')
const errorMsg = toRef(props, 'errorMsg')

</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto [--overlay-backdrop:static]"
       data-hs-overlay-keyboard="false">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all md:max-w-2xl md:w-full m-3 md:mx-auto">
      <div
          class="flex flex-col rounded-lg bg-white border shadow-sm  pointer-events-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 dark:border-gray-700">
          <h3 v-if="object" class="font-bold text-gray-800 dark:text-white">
            Your Created Resource:
          </h3>
          <button type="button"
                  :data-hs-overlay="`#${props.modalId}`"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>
        <div v-if="errorMsg" v-html="errorMsg" class="p-4 overflow-y-auto text-center text-red-500"></div>

        <div v-else-if="object" class="p-4 overflow-y-auto">
          <div class="border-t border-gray-100">
            <dl class="divide-y divide-gray-100">
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">ID</dt>
                <dd class="mt-1 text-sm leading-6 font-bold text-aruna-800 dark:text-aruna-700 sm:col-span-2 sm:mt-0">
                  {{ object.id }}
                </dd>
              </div>
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">Name</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{{ object.name }}</dd>
              </div>
              <div v-if="object.title" class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">Title</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{{ object.title }}</dd>
              </div>
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">Link</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                  <a :href="`/objects/${object.id}`">
                    <IconExternalLink/>
                  </a>
                </dd>
              </div>
            </dl>
            <div v-if="object.dataLicenseTag" class="text-sm text-center font-medium leading-6 text-orange-500">
              <hr class="border-gray-200 my-5">
              Please wait for your upload to finish before you leave the resource creation form.
              <!-- Progress -->
              <div class="flex items-center my-2 gap-x-3 whitespace-nowrap">
                <div class="flex w-full h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700"
                     role="progressbar"
                     :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                  <div
                      class="flex flex-col justify-center rounded-full overflow-hidden bg-aruna-800 text-xs text-white text-center whitespace-nowrap transition duration-500 dark:bg-blue-500"
                      :style="`width: ${progress}%`"></div>
                </div>
                <div class="w-10 text-end">
                  <span v-if="progress <= 0" class="animate-spin inline-block size-4 border-[3px] border-current border-t-transparent text-gray-500 rounded-full" role="status" aria-label="loading"></span>
                  <span v-else-if="progress < 100" class="text-sm text-gray-800 dark:text-white">{{ progress }}%</span>
                  <IconCircleCheck v-else class="text-teal-500"/>
                </div>
              </div>
              <!-- End Progress -->
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>