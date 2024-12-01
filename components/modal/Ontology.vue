<script lang="ts" setup>
import {IconBraces, IconExternalLink, IconX} from "@tabler/icons-vue";
import {v2KeyValueVariant} from "~/composables/aruna_api_json";
import type {OntologyDoc} from "~/types/OntologyDoc";

const props = defineProps<{
  modalId: string,
}>()

const emit = defineEmits<{
  'add-key-value': [key: string, value: string, kvType: v2KeyValueVariant]
}>()

const queryInput = ref('')
const results: Ref<OntologyDoc[]> = ref([])
const currentSelection: Ref<OntologyDoc | undefined> = ref(undefined)

watch(queryInput, () => debouncedInput())
const debouncedInput = debounce(async () => await searchOntologies(queryInput.value), 250)

async function searchOntologies(ontologyName: string): Promise<void> {
  if (!ontologyName) {
    results.value = []
    return
  }

  results.value = await $fetch<OntologyDoc[]>('/api/ontology', {
    query: {
      ontologyName: ontologyName
    }
  }).catch(error => {
    console.log(error)
    return []
  })
}

function createLandingPageLink(id: string) {
  id = id.replace(':', '')
  return `https://terminology.tib.eu/ts/ontologies/${id}`
}

function createMetadataLink(id: string) {
  id = id.replace(':', '')
  return `https://service.tib.eu/ts4tib/api/ontologies/${id}`
}

function selectOntology(selection: OntologyDoc) {
  currentSelection.value = selection
  queryInput.value = ''
  results.value = []
}

function reset() {
  currentSelection.value = undefined
}

function submit() {
  if (currentSelection.value) {
    emit('add-key-value',
        'http://purl.org/dc/terms/conformsTo',
        `{"@type": "CreativeWork", "@id": "${currentSelection.value.iri}", "url": "${createMetadataLink(currentSelection.value.id)}"}`,
        v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL)
    reset()
  }
}
</script>

<template>
  <ClientOnly>
    <div :id="props.modalId"
         class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto pointer-events-none [--tab-accessibility-limited:false]">
      <div
          class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
        <div
            class="flex flex-col bg-gray-800 border border-neutral-700 shadow-sm rounded-md pointer-events-auto shadow-neutral-700/70">
          <div class="flex justify-between items-center py-3 px-4 border-b border-neutral-700">
            <h3 class="font-bold text-gray-200">
              Add Ontology Definition
            </h3>
            <button :data-hs-overlay="`#${props.modalId}`"
                    @click="reset"
                    class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-200 hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-aruna-700"
                    type="button">
              <span class="sr-only">Close</span>
              <IconX class="flex-shrink-0 size-4"/>
            </button>
          </div>

          <div class="space-y-4 p-4">
            <!-- Display current selection -->
            <div v-if="currentSelection">
              <div>
                <div class="px-4 sm:px-0">
                  <h3 class="text-base font-semibold leading-7 text-gray-300">Currently selected ontology:</h3>
                  <p class="mt-1 font-bold max-w-2xl leading-6 text-aruna-700">
                    {{ currentSelection.label }}
                  </p>
                </div>
                <div class="my-6 border-y border-gray-100">
                  <dl class="divide-y divide-gray-100">
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-bold leading-6 text-gray-400">Id</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                        {{ currentSelection.id }}
                      </dd>
                    </div>
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-bold leading-6 text-gray-400">IRI</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                        <NuxtLink :to="currentSelection.iri"
                                  target="_blank"
                                  class="hs-tooltip-toggle text-aruna-700 hover:text-aruna-600">
                          {{ currentSelection.iri }}
                        </NuxtLink>

                      </dd>
                    </div>
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-bold leading-6 text-gray-400">Description</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                        {{ currentSelection.description.join(' ') }}
                      </dd>
                    </div>
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-bold leading-6 text-gray-400">More Information</dt>
                      <dd class="inline-flex mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                        <NuxtLink :to="createLandingPageLink(currentSelection.id)"
                                  target="_blank"
                                  class="hs-tooltip-toggle font-semibold text-aruna-700 hover:text-aruna-600">
                          <IconExternalLink class="size-6 flex-shrink-0"/>
                        </NuxtLink>
                        <NuxtLink :to="createMetadataLink(currentSelection.id)"
                                  target="_blank"
                                  class="font-semibold text-aruna-700 hover:text-aruna-600">
                          <IconBraces class="ms-6 size-6 flex-shrink-0"/>
                        </NuxtLink>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            <div v-else>
              <h3 class="text-base font-semibold leading-7 text-gray-300">Currently selected ontology: None</h3>
            </div>
            <!-- End display current selection -->

            <!-- Floating Input -->
            <div class="relative">
              <div class="relative">
                <input v-model="queryInput"
                       type="text"
                       id="ontology-search"
                       placeholder="Search an ontology definition"
                       class="peer p-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm placeholder:text-transparent focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none
                  focus:pt-6
                  focus:pb-2
                  [&:not(:placeholder-shown)]:pt-6
                  [&:not(:placeholder-shown)]:pb-2
                  autofill:pt-6
                  autofill:pb-2">
                <label for="ontology-search"
                       class="absolute top-0 start-0 p-4 h-full text-sm text-gray-300 truncate pointer-events-none transition ease-in-out duration-100 border border-transparent origin-[0_0] peer-disabled:opacity-50 peer-disabled:pointer-events-none
                  peer-focus:scale-90
                  peer-focus:translate-x-0.5
                  peer-focus:-translate-y-1.5
                  peer-focus:text-neutral-500
                  peer-[:not(:placeholder-shown)]:scale-90
                  peer-[:not(:placeholder-shown)]:translate-x-0.5
                  peer-[:not(:placeholder-shown)]:-translate-y-1.5
                  peer-[:not(:placeholder-shown)]:text-gray-500">
                  Search for an ontology definition
                </label>
              </div>

              <!-- Display search results -->
              <div v-if="results.length > 0"
                   class="absolute z-50 mt-2 min-w-96 max-w-md max-h-72 p-1 bg-slate-900 border border-gray-700 rounded-md overflow-hidden overflow-y-auto focus:outline-none focus:border-aruna-700 focus:ring-aruna-700
                   [&::-webkit-scrollbar]:w-2
                   [&::-webkit-scrollbar-thumb]:rounded-full
                   [&::-webkit-scrollbar-track]:bg-neutral-700
                   [&::-webkit-scrollbar-thumb]:bg-neutral-500">
                <div v-for="ontology in results"
                     @click="selectOntology(ontology)"
                     class="cursor-pointer p-2 space-y-0.5 w-full text-sm text-gray-300 hover:bg-gray-700 rounded-md focus:outline-none">
                  <div class="flex justify-between items-center w-full">
                    <div>{{ ontology.label }}</div>
                  </div>
                </div>
              </div>
              <!-- End display search results -->
            </div>
            <!-- End Floating Input -->
          </div>


          <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t border-gray-700">
            <button type="button" @click="reset"
                    class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-700 bg-slate-900 text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none"
                    :data-hs-overlay="`#${props.modalId}`">
              Close
            </button>
            <button type="button"
                    :disabled="currentSelection === undefined"
                    @click="submit"
                    class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none"
                    :data-hs-overlay="`#${props.modalId}`">
              Add Ontology
            </button>
          </div>

        </div>
      </div>
    </div>
  </ClientOnly>
</template>