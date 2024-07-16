<script setup lang="ts">
import {IconX, IconInfoSquareRounded} from "@tabler/icons-vue";

const props = defineProps<{
  modalId: string,
}>()

const infoTitle = useRuntimeConfig().public.infoBanner.title
const infoText = useRuntimeConfig().public.infoBanner.text
const infoLink = useRuntimeConfig().public.infoBanner.link

</script>
<template>
  <div :id="modalId"
       class="hs-removing:translate-x-5 hs-removing:opacity-0 mx-auto max-w-5xl transition duration-300 bg-white dark:bg-slate-800 border border-gray-200 rounded-lg shadow-lg p-4 dark:border-neutral-700"
       role="alert">
    <div class="flex items-center">
      <div class="flex-shrink-0">
        <IconInfoSquareRounded class="flex-shrink-0 size-6 text-aruna-800 dark:text-aruna-700"/>
      </div>
      <div class="flex ms-3">
        <p>
          <span class="text-sm text-gray-800 font-semibold dark:text-white">{{ infoTitle }} </span>
          <span class="mt-2 text-sm text-gray-700 dark:text-neutral-400">{{ infoText }}  </span>
          <span v-if="infoLink" class="mt-2 text-sm text-gray-700 dark:text-neutral-400">More information can be found
          <NuxtLink :to="infoLink"
                    target="_blank"
                    class="font-bold text-aruna-800 dark:text-aruna-700 hover:text-aruna-700 hover:dark:text-aruna-600">here</NuxtLink>.
        </span>
        </p>
      </div>

      <div class="flex ps-3 ms-5">
        <button type="button"
                class="inline-flex justify-center items-center size-4"
                :data-hs-remove-element="`#${modalId}`"
                @click="closeModal(modalId)">
          <span class="sr-only">Dismiss</span>
          <IconX class="flex-shrink-0 size-4"/>
        </button>
      </div>
    </div>
  </div>
</template>