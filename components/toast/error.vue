<script lang="ts" setup>
import {IconX, IconCircleX} from "@tabler/icons-vue";

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
        class="max-w-lg bg-white border border-gray-200 rounded-md shadow-lg dark:bg-neutral-800 dark:border-neutral-700"
        role="alert">
      <div class="flex items-center p-4">
        <div class="flex-shrink-0">
          <IconCircleX class="flex size-6 text-red-500 font-bold mt-0.5"/>
        </div>
        <div class="flex ms-3">
          <p class="text-sm text-gray-700 dark:text-neutral-400">
            {{ errorMsg }}
          </p>
        </div>

        <div class="flex ms-3">
          <button type="button" @click="emitEvent" class="inline-flex justify-center items-center size-4"
                  :data-hs-remove-element="modalId">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>