<script lang="ts" setup>
import {v2PermissionLevel} from "~/composables/aruna_api_json";

const props = defineProps<{
  modalId: string
}>()

const tokenScopes = {
  Unspecified: '',
  Personal: 'personal',
  Project: 'project',
  Collection: 'collection',
  Dataset: 'dataset',
  Object: 'object'
}

const options = [
  {text: 'Personal', value: tokenScopes.Personal},
  {text: 'Project', value: tokenScopes.Project},
  {text: 'Collection', value: tokenScopes.Collection},
  {text: 'Dataset', value: tokenScopes.Dataset},
  {text: 'Object', value: tokenScopes.Object},
]

const tokenName = ref('')
const tokenScope = ref(tokenScopes.Unspecified)
const tokenPermission = ref(v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED)
const validationStatus = ref(false)

function validate() {

}
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
            Create Token
          </h3>
          <button :data-hs-overlay="`#${props.modalId}`"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  type="button">
            <span class="sr-only">Close</span>
            <svg class="flex-shrink-0 size-4" fill="none" height="24" stroke="currentColor"
                 stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"
                 xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-4 overflow-y-auto">
          <p class="my-2 text-gray-800 dark:text-gray-400">
            Here you can create a new token.
          </p>

          <!-- Floating Input Token Name -->
          <div class="relative">
            <input v-model="tokenName"
                   id="hs-floating-input-email"
                   class="my-2 peer p-4 block w-full border-gray-200 rounded-lg text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2" placeholder="you@email.com" type="email">
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="hs-floating-input-email">Token Name</label>
          </div>
          <!-- End Floating Input Token Name -->

          <!-- Floating Select -->
          <div class="relative">
            <select v-model="tokenScope"
                    class="my-2 peer p-4 pe-9 block w-full border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                    focus:pt-6
                    focus:pb-2
                    [&:not(:placeholder-shown)]:pt-6
                    [&:not(:placeholder-shown)]:pb-2
                    autofill:pt-6
                    autofill:pb-2">
              <option v-for="(option, index) in options" :value="option.value" v-bind:selected="index === 0">
                {{ option.text }}
              </option>
            </select>
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500">Label</label>
          </div>
          <!-- End Floating Select -->

        </div>
        <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t dark:border-gray-700">
          <button :data-hs-overlay="`#${props.modalId}`"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  type="button">
            Close
          </button>
          <button class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  type="button">
            Understood
          </button>
        </div>
      </div>
    </div>
  </div>
</template>