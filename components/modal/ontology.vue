<script lang="ts" setup>
import {IconBraces, IconExternalLink, IconX} from "@tabler/icons-vue";
import {v2KeyValueVariant} from "~/composables/aruna_api_json";
import type {OntologyDoc} from "~/composables/ts_api/OntologyDoc";

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
        'https://purl.org/dc/terms/conformsTo',
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
            class="flex flex-col bg-white border shadow-sm rounded-md pointer-events-auto dark:bg-neutral-800 dark:border-neutral-700 dark:shadow-neutral-700/70">
          <div class="flex justify-between items-center py-3 px-4 border-b dark:border-neutral-700">
            <h3 class="font-bold text-gray-800 dark:text-white">
              Add Ontology Definition
            </h3>
            <button :data-hs-overlay="`#${props.modalId}`"
                    @click="reset"
                    class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
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
                  <h3 class="text-base font-semibold leading-7 text-gray-900">Currently selected ontology:</h3>
                  <p class="mt-1 font-bold max-w-2xl leading-6 text-gray-500">
                    {{ currentSelection.label }}
                  </p>
                </div>
                <div class="my-6 border-y border-gray-100">
                  <dl class="divide-y divide-gray-100">
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-900">Id</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{{
                          currentSelection.id
                        }}
                      </dd>
                    </div>
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-900">IRI</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                        <NuxtLink :to="currentSelection.iri"
                                  target="_blank"
                                  class="hs-tooltip-toggle text-aruna-800 dark:text-aruna-600">
                          {{ currentSelection.iri }}
                        </NuxtLink>

                      </dd>
                    </div>
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-900">Description</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                        {{ currentSelection.description.join(' ') }}
                      </dd>
                    </div>
                    <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-900">More Information</dt>
                      <dd class="inline-flex mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                        <div class="hs-tooltip [--placement:bottom] inline-block">
                          <NuxtLink :to="createLandingPageLink(currentSelection.id)"
                                    target="_blank"
                                    class="hs-tooltip-toggle font-semibold text-aruna-800 dark:text-aruna-600">
                            <IconExternalLink class="size-6 flex-shrink-0"/>
                          </NuxtLink>
                          <span
                              class="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible opacity-0 transition-opacity inline-block absolute invisible z-10 py-1 px-2 bg-gray-900 text-xs font-medium text-white rounded shadow-sm dark:bg-neutral-700"
                              role="tooltip">
                            Tooltip on bottom
                          </span>
                        </div>
                        <NuxtLink :to="createMetadataLink(currentSelection.id)"
                                  target="_blank"
                                  class="font-semibold text-aruna-800 dark:text-aruna-600">
                          <IconBraces class="ms-6 size-6 flex-shrink-0"/>
                        </NuxtLink>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            <div v-else>
              <h3 class="text-base font-semibold leading-7 text-gray-900">Currently selected ontology: None</h3>
            </div>
            <!-- End display current selection -->

            <!-- Floating Input -->
            <div class="relative">
              <div class="relative">
                <input v-model="queryInput"
                       type="text"
                       id="ontology-search"
                       placeholder="Search an ontology definition"
                       class="peer p-4 block w-full border-gray-200 rounded-md text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:focus:ring-neutral-600
                  focus:pt-6
                  focus:pb-2
                  [&:not(:placeholder-shown)]:pt-6
                  [&:not(:placeholder-shown)]:pb-2
                  autofill:pt-6
                  autofill:pb-2">
                <label for="ontology-search"
                       class="absolute top-0 start-0 p-4 h-full text-sm text-gray-500 truncate pointer-events-none transition ease-in-out duration-100 border border-transparent origin-[0_0] dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
                  peer-focus:scale-90
                  peer-focus:translate-x-0.5
                  peer-focus:-translate-y-1.5
                  peer-focus:text-gray-500 dark:peer-focus:text-neutral-500
                  peer-[:not(:placeholder-shown)]:scale-90
                  peer-[:not(:placeholder-shown)]:translate-x-0.5
                  peer-[:not(:placeholder-shown)]:-translate-y-1.5
                  peer-[:not(:placeholder-shown)]:text-gray-500 dark:peer-[:not(:placeholder-shown)]:text-neutral-500 dark:text-neutral-500">
                  Search for an ontology definition
                </label>
              </div>

              <!-- Display search results -->
              <div v-if="results.length > 0"
                   class="absolute z-50 mt-2 min-w-96 max-w-md max-h-72 p-1 bg-white border border-gray-200 rounded-md overflow-hidden overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-track]:bg-neutral-700 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500 dark:bg-neutral-900 dark:border-neutral-700">
                <div v-for="ontology in results"
                     @click="selectOntology(ontology)"
                     class="cursor-pointer p-2 space-y-0.5 w-full text-sm text-gray-800 hover:bg-gray-100 rounded-md focus:outline-none focus:bg-gray-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 dark:focus:bg-neutral-700">
                  <div class="flex justify-between items-center w-full">
                    <div>{{ ontology.label }}</div>
                  </div>
                </div>
              </div>
              <!-- End display search results -->
            </div>
            <!-- End Floating Input -->
          </div>


          <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t dark:border-gray-700">
            <button type="button" @click="reset"
                    class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
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