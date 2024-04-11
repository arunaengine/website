<script lang="ts" setup>
import {IconX} from "@tabler/icons-vue";
import {
  type v2InternalRelation,
  v2InternalRelationVariant,
  type v2Relation,
  v2RelationDirection,
  v2ResourceVariant
} from "~/composables/aruna_api_json";

const props = defineProps<{
  modalId: string,
}>()

const emit = defineEmits<{
  'add-relation': [relation: v2Relation]
}>()

enum InternalRelationVariant {
  BelongsTo = 'Belongs To',
  Origin = 'Origin',
  Version = 'Version',
  Metadata = 'Metadata',
  Policy = 'Policy',
  Deleted = 'Deleted',
  Custom = 'Custom',
}

enum RelationDirection {
  Inbound = 'Inbound',
  Outbound = 'Outbound',
}

const resourceId = ref('')
const resourceVariant = ref(v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED)
const relationVariant = ref(InternalRelationVariant.BelongsTo)
const customVariant = ref('')
const relationDirection = ref(RelationDirection.Inbound)

function convertInternalRelationVariant(variant: InternalRelationVariant): v2InternalRelationVariant {
  switch(variant) {
    case InternalRelationVariant.BelongsTo: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO
    case InternalRelationVariant.Origin: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN
    case InternalRelationVariant.Version: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION
    case InternalRelationVariant.Metadata: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA
    case InternalRelationVariant.Policy: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY
    case InternalRelationVariant.Deleted: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_DELETED
    case InternalRelationVariant.Custom: return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM
  }
}

function convertRelationDirection(direction: RelationDirection): v2RelationDirection {
  switch(direction) {
    case RelationDirection.Inbound: return v2RelationDirection.RELATION_DIRECTION_INBOUND
    case RelationDirection.Outbound: return v2RelationDirection.RELATION_DIRECTION_OUTBOUND
  }
}

function reset() {
  resourceId.value = ''
  resourceVariant.value = v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED
  relationVariant.value = InternalRelationVariant.BelongsTo
  customVariant.value = ''
  relationDirection.value = RelationDirection.Inbound
}

function submit() {
  let internal_relation = {
    resourceId: resourceId.value,
    resourceVariant: resourceVariant.value,
    definedVariant: convertInternalRelationVariant(relationVariant.value),
    customVariant: relationVariant.value === InternalRelationVariant.Custom ? customVariant.value : undefined,
    direction: convertRelationDirection(relationDirection.value)
  } as v2InternalRelation

  emit('add-relation', { internal: internal_relation } as v2Relation)
  reset()
}
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto pointer-events-none">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all lg:max-w-4xl lg:w-full m-3 lg:mx-auto">
      <div
          class="flex flex-col bg-white border shadow-sm rounded-xl pointer-events-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 border-b dark:border-gray-700">
          <h3 class="font-bold text-gray-800 dark:text-white">
            Add Relation
          </h3>
          <button :data-hs-overlay="`#${props.modalId}`" @click="reset"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  type="button">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4" />
          </button>
        </div>
        <div class="flex flex-row space-x-4 p-4 overflow-y-auto">
          <div class="flex flex-col grow">
            <label for="key-input-label" class="block text-sm font-medium mb-2 dark:text-white">Resource Id</label>
            <input v-model="resourceId" type="text" id="key-input-label"
                   class="py-3 px-4 block w-full border-gray-200 rounded-lg text-sm focus:border-aruna-800 focus:ring-aruna-800 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
                   placeholder="Enter a valid resource id" autofocus>
          </div>

          <div class="flex flex-col grow">
            <label for="key-input-label" class="block text-sm font-medium mb-2 dark:text-white">Relation
              Direction</label>
            <select v-model="relationDirection" id="type-input-select"
                    class="py-3 px-4 pe-9 block w-full border-gray-200 rounded-lg text-sm focus:border-aruna-800 focus:ring-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="direction in RelationDirection" :value="direction"
                      v-bind:selected="direction === RelationDirection.Outbound">
                {{ direction }}
              </option>
            </select>
          </div>

          <div class="flex flex-col grow">
            <label for="key-input-label" class="block text-sm font-medium mb-2 dark:text-white">Relation Variant</label>
            <select v-model="relationVariant" id="type-input-select"
                    class="py-3 px-4 pe-9 block w-full border-gray-200 rounded-lg text-sm focus:border-aruna-800 focus:ring-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="variant in InternalRelationVariant" :value="variant"
                      v-bind:selected="variant === InternalRelationVariant.BelongsTo">
                {{ variant }}
              </option>
            </select>
          </div>

          <div v-if="relationVariant === InternalRelationVariant.Custom" class="flex flex-col grow">
            <label for="value-input-label" class="block text-sm font-medium mb-2 dark:text-white">Custom Variant</label>
            <input v-model="customVariant" type="text" id="value-input-label"
                   class="py-3 px-4 block w-full border-gray-200 rounded-lg text-sm focus:border-aruna-800 focus:ring-aruna-800 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
                   placeholder="Enter a value">
          </div>

        </div>
        <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t dark:border-gray-700">
          <button type="button" @click="reset"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                  :data-hs-overlay="`#${props.modalId}`">
            Close
          </button>
          <button type="button" @click="submit"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none"
                  :data-hs-overlay="`#${props.modalId}`">
            Add Relation
          </button>
        </div>

      </div>
    </div>
  </div>
</template>