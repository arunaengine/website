<script lang="ts" setup>
import {IconExclamationCircle, IconX} from "@tabler/icons-vue";
import {
  type v2InternalRelation,
  v2InternalRelationVariant,
  type v2Relation,
  v2RelationDirection,
  v2ResourceVariant
} from "~/composables/aruna_api_json";
import {ULID_REGEX} from "~/composables/constants";

const props = defineProps<{
  modalId: string,
}>()

const emit = defineEmits<{
  'add-relation': [relation: v2Relation]
}>()

enum ResourceVariant {
  Project = 'Project',
  Collection = 'Collection',
  Dataset = 'Dataset',
  Object = 'Object'
}

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
const resourceIdErr: Ref<string | undefined> = ref('Please enter a resource id.')
const resourceVariant = ref(ResourceVariant.Project)
const relationVariant = ref(InternalRelationVariant.BelongsTo)
const customVariant = ref('')
const customVariantErr: Ref<string | undefined> = ref(undefined)
const relationDirection = ref(RelationDirection.Inbound)

const validState = ref(false)
const validationStates = ref(new Map<string, boolean>())
validationStates.value.set('resource_id', false)
validationStates.value.set('custom_variant', true)


// Validation
watch(resourceId, () => validateResourceId())
function validateResourceId() {
  if (resourceId.value.length > 0) {
    const valid = ULID_REGEX.test(resourceId.value)
    validationStates.value.set('resource_id', valid)
    resourceIdErr.value = valid ? undefined : 'Please enter a valid ULID'
  } else {
    validationStates.value.set('resource_id', false)
    resourceIdErr.value = 'Please enter a resource id'
  }
  validate()
}

watch(resourceVariant, () => validate())
watch(relationVariant, () => validateCustomVariant())
watch(customVariant, () => validateCustomVariant())
function validateCustomVariant() {
  if (relationVariant.value === InternalRelationVariant.Custom && customVariant.value.length <= 0) {
    validationStates.value.set('custom_variant', false)
    customVariantErr.value = 'Please enter a custom relation name'
  } else {
    validationStates.value.set('custom_variant', true)
    customVariantErr.value = undefined
  }
  validate()
}

function validate() {
  for (const state of validationStates.value.values()) {
    if (!state) {
      validState.value = false
      return
    }
  }
  validState.value = true
}

function convertResourceVariant(variant: ResourceVariant): v2ResourceVariant {
  switch (variant) {
    case ResourceVariant.Project:
      return v2ResourceVariant.RESOURCE_VARIANT_PROJECT
    case ResourceVariant.Collection:
      return v2ResourceVariant.RESOURCE_VARIANT_COLLECTION
    case ResourceVariant.Dataset:
      return v2ResourceVariant.RESOURCE_VARIANT_DATASET
    case ResourceVariant.Object:
      return v2ResourceVariant.RESOURCE_VARIANT_OBJECT

  }
}

function convertInternalRelationVariant(variant: InternalRelationVariant): v2InternalRelationVariant {
  switch (variant) {
    case InternalRelationVariant.BelongsTo:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO
    case InternalRelationVariant.Origin:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN
    case InternalRelationVariant.Version:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION
    case InternalRelationVariant.Metadata:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA
    case InternalRelationVariant.Policy:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY
    case InternalRelationVariant.Deleted:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_DELETED
    case InternalRelationVariant.Custom:
      return v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM
  }
}

function convertRelationDirection(direction: RelationDirection): v2RelationDirection {
  switch (direction) {
    case RelationDirection.Inbound:
      return v2RelationDirection.RELATION_DIRECTION_INBOUND
    case RelationDirection.Outbound:
      return v2RelationDirection.RELATION_DIRECTION_OUTBOUND
  }
}

function reset() {
  resourceId.value = ''
  resourceVariant.value = ResourceVariant.Project
  relationVariant.value = InternalRelationVariant.BelongsTo
  customVariant.value = ''
  relationDirection.value = RelationDirection.Inbound
}

function submit() {
  let internal_relation = {
    resourceId: resourceId.value,
    resourceVariant: convertResourceVariant(resourceVariant.value),
    definedVariant: convertInternalRelationVariant(relationVariant.value),
    customVariant: relationVariant.value === InternalRelationVariant.Custom ? customVariant.value : undefined,
    direction: convertRelationDirection(relationDirection.value)
  } as v2InternalRelation

  emit('add-relation', {internal: internal_relation} as v2Relation)
  reset()
}
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto pointer-events-none [--tab-accessibility-limited:false]">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div
          class="flex flex-col bg-white border shadow-sm rounded-md pointer-events-auto dark:bg-gray-800 dark:border-neutral-700 dark:shadow-neutral-700/70">
        <div class="flex justify-between items-center py-3 px-4 border-b dark:border-neutral-700">
          <h3 class="font-bold text-gray-800 dark:text-white">
            Add Internal Relation
          </h3>
          <button :data-hs-overlay="`#${props.modalId}`" @click="reset"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  type="button">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>

        <div class="space-y-4 p-4 overflow-y-auto">
          <!-- Resource id -->
          <div class="space-y-0">
            <div class="relative">
              <input v-model="resourceId"
                     autofocus
                     id="hs-floating-input-resource"
                     class="mt-2 peer p-4 block w-full border-gray-200 rounded-md text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-300 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2" placeholder="A resource id" type="text">
              <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="hs-floating-input-resource">Resource ID</label>
              <div :class="{ 'hidden': typeof resourceIdErr === 'undefined'}"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': typeof resourceIdErr === 'undefined'}" class="text-sm text-red-600 mt-1"
               id="hs-validation-name-error-helper">{{ resourceIdErr }}
            </p>
          </div>
          <!-- End Resource id -->

          <!-- Resource variant -->
          <div class="relative">
            <select v-model="resourceVariant"
                    class="my-2 peer p-4 pe-9 block w-full border-gray-200 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-300 dark:focus:ring-gray-600
                    focus:pt-6
                    focus:pb-2
                    [&:not(:placeholder-shown)]:pt-6
                    [&:not(:placeholder-shown)]:pb-2
                    autofill:pt-6
                    autofill:pb-2">
              <option v-for="variant in ResourceVariant" :value="variant"
                      v-bind:selected="variant === ResourceVariant.Project">
                {{ variant }}
              </option>
            </select>
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500">Resource Variant</label>
          </div>
          <!-- End Resource variant -->

          <!-- Relation direction -->
          <div class="relative">
            <select v-model="relationDirection"
                    class="my-2 peer p-4 pe-9 block w-full border-gray-200 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-300 dark:focus:ring-gray-600
                    focus:pt-6
                    focus:pb-2
                    [&:not(:placeholder-shown)]:pt-6
                    [&:not(:placeholder-shown)]:pb-2
                    autofill:pt-6
                    autofill:pb-2">
              <option v-for="direction in RelationDirection" :value="direction"
                      v-bind:selected="direction === RelationDirection.Outbound">
                {{ direction }}
              </option>
            </select>
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500">Relation Direction</label>
          </div>
          <!-- End Relation direction -->

          <!-- Relation variant -->
          <div class="relative">
            <select v-model="relationVariant"
                    class="my-2 peer p-4 pe-9 block w-full border-gray-200 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-300 dark:focus:ring-gray-600
                    focus:pt-6
                    focus:pb-2
                    [&:not(:placeholder-shown)]:pt-6
                    [&:not(:placeholder-shown)]:pb-2
                    autofill:pt-6
                    autofill:pb-2">
              <option v-for="variant in InternalRelationVariant" :value="variant"
                      v-bind:selected="variant === InternalRelationVariant.BelongsTo">
                {{ variant }}
              </option>
            </select>
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500">Relation Variant</label>
          </div>
          <!-- End Relation variant -->

          <!-- Custom variant input -->
          <div v-if="relationVariant === InternalRelationVariant.Custom" class="space-y-0">
            <div class="relative">
              <input v-model="customVariant"
                     id="hs-floating-input-resource"
                     class="mt-2 peer p-4 block w-full border-gray-200 rounded-md text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2" placeholder="A resource id" type="text">
              <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="hs-floating-input-resource">Custom Variant</label>
              <div :class="{ 'hidden': typeof customVariantErr === 'undefined'}"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': typeof customVariantErr === 'undefined'}" class="text-sm text-red-600 mt-1"
               id="hs-validation-name-error-helper">{{ customVariantErr }}
            </p>
          </div>
          <!-- End Custom variant input -->
        </div>
        <!-- End Relation variant -->

        <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t dark:border-gray-700">
          <button type="button" @click="reset"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                  :data-hs-overlay="`#${props.modalId}`">
            Close
          </button>
          <button type="button" :disabled="!validState"
                  @click="submit"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none"
                  :data-hs-overlay="`#${props.modalId}`">
            Add Relation
          </button>
        </div>

      </div>
    </div>
  </div>
</template>