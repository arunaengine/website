<script lang="ts" setup>
const props = defineProps<{
  modalId: string
}>()

</script>

<template>
  <div :id="props.modalId"
    class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto [--overlay-backdrop:static]"
    data-hs-overlay-keyboard="false">
    <div
      class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div
        class="flex flex-col bg-white border shadow-sm  pointer-events-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 border-b dark:border-gray-700">
          <h3 class="font-bold text-gray-800 dark:text-white">
            Your S3 Credentials
          </h3>
          <button :data-hs-overlay="`#${props.modalId}`"
            class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            type="button">
            <span class="sr-only">Close</span>
            <svg class="flex-shrink-0 size-4" fill="none" height="24" stroke="currentColor" stroke-linecap="round"
              stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"
              xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div class="p-4 overflow-y-auto">
          <p class="my-2 text-gray-800 dark:text-gray-400">
            Here you can create a new token.
          </p>
        </div>
          
      </div>
    </div>
  </div>
</template>