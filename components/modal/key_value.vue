<script lang="ts" setup>
import {IconX} from "@tabler/icons-vue";
import {v2KeyValueVariant} from '~/composables/aruna_api_json';

const props = defineProps<{
  modalId: string,
}>()

const emit = defineEmits<{
  'add-key-value': [key: string, value: string, kvType: v2KeyValueVariant]
}>()

enum KeyValueVariant {
  Label = 'Label',
  StaticLabel = 'Static Label',
  Hook = 'Hook'
}

const kvKey = ref('')
const kvValue = ref('')
const kvType = ref(KeyValueVariant.Label)

function convertKeyValueVariant(variant: KeyValueVariant): v2KeyValueVariant {
  switch (variant) {
    case KeyValueVariant.Label:
      return v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL
    case KeyValueVariant.StaticLabel:
      return v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL
    case KeyValueVariant.Hook:
      return v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK
  }
}

function displayKeyValueVariant(variant: KeyValueVariant) {
  switch (variant) {
    case KeyValueVariant.Label:
      return "Label"
    case KeyValueVariant.StaticLabel:
      return "Static Label"
    case KeyValueVariant.Hook:
      return "Hook"
  }
}

function reset() {
  kvKey.value = ''
  kvValue.value = ''
  kvType.value = KeyValueVariant.Label
}

function submit() {
  emit('add-key-value', kvKey.value, kvValue.value, convertKeyValueVariant(kvType.value))
  reset()
}
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto pointer-events-none [--tab-accessibility-limited:false]">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all lg:max-w-4xl lg:w-full m-3 lg:mx-auto">
      <div
          class="flex flex-col bg-gray-800 border border-gray-700 shadow-sm rounded-md pointer-events-auto shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 border-b border-gray-700">
          <h3 class="font-bold text-gray-200">
            Add Key-Value
          </h3>
          <button :data-hs-overlay="`#${props.modalId}`"
                  @click="reset"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-200 hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-aruna-700"
                  type="button">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4" />
          </button>
        </div>
        <div class="flex flex-row space-x-4 p-4 overflow-y-auto">
          <div class="flex flex-col grow">
            <label for="key-input-label"
                   class="block text-sm font-medium mb-2 text-gray-200">Key</label>
            <input v-model="kvKey" type="text" id="key-input-label"
                   class="py-3 px-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm focus:border-aruna-800 focus:ring-aruna-800"
                   placeholder="Enter a key" autofocus>
          </div>
          <div class="flex flex-col grow">
            <label for="value-input-label"
                   class="block text-sm font-medium mb-2 text-gray-200">Value</label>
            <input v-model="kvValue" type="text" id="value-input-label"
                   class="py-3 px-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm focus:border-aruna-800 focus:ring-aruna-800"
                   placeholder="Enter a value">
          </div>

          <div class="flex flex-col grow">
            <label for="type-input-select"
                   class="block text-sm font-medium mb-2 text-gray-200">Variant</label>
            <select v-model="kvType" id="type-input-select"
                    class="py-3 px-4 pe-9 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none">
              <option v-for="kvv in KeyValueVariant" :value="kvv"
                      v-bind:selected="kvv === KeyValueVariant.Label">
                {{ displayKeyValueVariant(kvv) }}
              </option>
            </select>


          </div>
        </div>
        <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t border-gray-700">
          <button type="button"
                  @click="reset"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-700 bg-slate-900 text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none"
                  :data-hs-overlay="`#${props.modalId}`">
            Close
          </button>
          <button type="button"
                  @click="submit"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none"
                  :data-hs-overlay="`#${props.modalId}`">
            Add KeyValue
          </button>
        </div>

      </div>
    </div>
  </div>
</template>