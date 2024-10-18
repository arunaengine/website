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
          class="flex flex-col rounded-md bg-gray-800 border border-gray-700 shadow-sm pointer-events-auto shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 border-gray-700">
          <h3 v-if="object" class="font-bold text-gray-200">
            Your Created Resource:
          </h3>
          <button type="button"
                  :data-hs-overlay="`#${props.modalId}`"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-aruna-700">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>
        <div v-if="errorMsg" v-html="errorMsg" class="p-4 overflow-y-auto text-center text-red-500"></div>

        <div v-else-if="object" class="p-4 overflow-y-auto">
          <div class="">
            <dl class="border-y border-gray-100 divide-y divide-gray-100 mb-5">
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-400">ID</dt>
                <dd class="mt-1 text-sm leading-6 font-bold text-aruna-700 sm:col-span-2 sm:mt-0">
                  {{ object.id }}
                </dd>
              </div>
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-400">Name</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">{{ object.name }}</dd>
              </div>
              <div v-if="object.title" class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-400">Title</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">{{ object.title }}</dd>
              </div>
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-400">Link</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                  <a :href="`/objects/${object.id}`">
                    <IconExternalLink/>
                  </a>
                </dd>
              </div>
            </dl>
            <div v-if="object.dataLicenseTag" class="text-sm text-center font-medium leading-6">
              <span class="text-orange-500">Please wait for your upload to finish before you leave the resource creation form.</span>

              <!-- Progress -->
              <div class="flex items-center my-2 gap-x-3 whitespace-nowrap">
                <div class="flex w-5/6 h-2 bg-gray-700 rounded-full overflow-hidden"
                     role="progressbar"
                     :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                  <div :style="`width: ${progress}%`"
                       class="flex flex-col justify-center rounded-full overflow-hidden bg-aruna-700 text-xs text-white text-center whitespace-nowrap transition duration-500"></div>
                </div>
                <span v-if="progress < 100">
                  {{ progress }}% 
                </span>
                <IconCircleCheck v-else class="text-green-600"/>
                <div class="ms-4 text-end">
                  <button
                    type="button"
                    @click="closeModal(props.modalId)"
                    :data-hs-overlay="`#${props.modalId}`"
                    class="py-2 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 focus:outline-none focus:bg-aruna-800 disabled:opacity-50 disabled:pointer-events-none"
                    :disabled="progress < 100">
                    Close
                  </button>
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