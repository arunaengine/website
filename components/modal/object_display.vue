<script lang="ts" setup>
import {IconExternalLink, IconX} from "@tabler/icons-vue";
import type {v2Collection, v2Dataset, v2Object, v2Project} from "~/composables/aruna_api_json";

const props = defineProps<{
  modalId: string,
  object: v2Project | v2Collection | v2Dataset | v2Object | undefined,
  errorMsg: string | undefined
}>()

const object = toRef(props, 'object')
const errorMsg = toRef(props, 'errorMsg')

</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto [--overlay-backdrop:static]"
       data-hs-overlay-keyboard="false">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div
          class="flex flex-col rounded-lg bg-white border shadow-sm  pointer-events-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 dark:border-gray-700">
          <h3 v-if="object" class="font-bold text-gray-800 dark:text-white">
            Your Created Resource:
            <!--
            <span class="font-bold text-aruna-800"> {{ object.id }}</span>
            <span class="font-bold text-aruna-800"> {{ object.title }}</span>
            -->
          </h3>
          <button type="button"
                  :data-hs-overlay="`#${props.modalId}`"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>
        <div v-if="errorMsg" class="p-4 overflow-y-auto text-red-500">
          {{ errorMsg }}
        </div>

        <div v-else-if="object" class="p-4 overflow-y-auto">
          <div class="border-t border-gray-100">
            <dl class="divide-y divide-gray-100">
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">ID</dt>
                <dd class="mt-1 text-sm leading-6 font-bold text-aruna-800 dark:text-aruna-700 sm:col-span-2 sm:mt-0">{{ object.id }}</dd>
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
                  <a :href="`/objects/${object.id}`"><IconExternalLink/></a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>