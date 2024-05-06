<script lang="ts" setup>
import {IconCircleX} from "@tabler/icons-vue";

const props = defineProps<{
  modalId: string,
  errorMsg: string
}>()
const errorMsg = toRef(props, 'errorMsg')

const emit = defineEmits(['clearError'])

function emitEvent() {
  emit('clearError')
}

</script>
<template>
  <div v-if="errorMsg" :id="modalId" class="absolute top-1 start-1/2 -translate-x-1/2">
    <div
        class="max-w-lg bg-white border border-gray-200 rounded-xl shadow-lg dark:bg-neutral-800 dark:border-neutral-700"
        role="alert">
      <div class="flex items-center p-4">
        <div class="flex-shrink-0">
          <IconCircleX class="flex size-6 text-red-500 font-bold mt-0.5"/>
        </div>
        <div class="ms-3">
          <p class="text-sm text-gray-700 dark:text-neutral-400">
            {{ errorMsg }}
          </p>
        </div>
        <div class="ms-3">

          <button type="button" @click="emitEvent" class="inline-flex justify-center items-center size-4"
                  :data-hs-remove-element="modalId">
            <span class="sr-only">Close</span>
            <svg class="flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>