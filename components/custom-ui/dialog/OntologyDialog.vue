<script setup lang="ts">
/* ----- PROPERTIES ----- */
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "~/components/ui/dialog";
import {Button} from "~/components/ui/button";
import type {OntologyDoc} from "~/composables/ts_api/OntologyDoc";
import {IconBraces, IconExternalLink, IconLoader2} from "@tabler/icons-vue";
import {v2KeyValueVariant} from "~/composables/aruna_api_json";

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean
  withButton: boolean
  buttonCss: string
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => (open.value = externalTrigger.value))
/* ----- END PROPERTIES ----- */

/* ----- EMITS ----- */
const emit = defineEmits<{
  'add-key-value': [key: string, value: string, kvType: v2KeyValueVariant]
}>()
/* ----- END EMITS ----- */

const queryInput = ref('')
const fetching = ref(false)
const results: Ref<OntologyDoc[]> = ref([]) //ref([{label: 'test'}, {label: 'test2'}, {label: 'test3'}])
const currentSelection: Ref<OntologyDoc | undefined> = ref(undefined)

// Debounce input to decrease number of requests
watch(queryInput, () => {
  // Empty input only clears results
  if (!queryInput.value) {
    results.value = []
    return
  }

  fetching.value = true
  results.value = []
  debouncedInput()
})
const debouncedInput = debounce(async () => await searchOntologies(queryInput.value), 250)

async function searchOntologies(ontologyName: string): Promise<void> {
  // No need to search with empty input
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
  fetching.value = false
}

function selectOntology(selection: OntologyDoc) {
  currentSelection.value = selection
  queryInput.value = ''
  results.value = []
}

function createLandingPageLink(id: string) {
  id = id.replace(':', '')
  return `https://terminology.tib.eu/ts/ontologies/${id}`
}

function createMetadataLink(id: string) {
  id = id.replace(':', '')
  return `https://service.tib.eu/ts4tib/api/ontologies/${id}`
}

function submit() {
  if (currentSelection.value) {
    emit('add-key-value',
        'http://purl.org/dc/terms/conformsTo',
        `{"@type": "CreativeWork", "@id": "${currentSelection.value.iri}", "url": "${createMetadataLink(currentSelection.value.id)}"}`,
        v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL)
    clear()
    open.value = false
  }
}

function clear() {
  currentSelection.value = undefined
  results.value = []
}
</script>

<template>
  <Dialog v-model:open="open" @update:open="clear">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline"
              :class="cn('rounded-sm text-aruna-highlight border border-aruna-highlight bg-transparent hover:bg-aruna-highlight hover:text-aruna-text-accent', props.buttonCss)">
        Add Ontology
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-2xl sm:rounded-md"
                   @pointer-down-outside="event => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-highlight font-bold">Add Ontology Definition</DialogTitle>
      </DialogHeader>

      <!-- Display current selection -->
      <div class="rounded-sm border border-aruna-text/50 p-4">
        <div class="flex flex-wrap items-center px-4 sm:px-0">
          <h3 class="text-base font-semibold leading-7 text-aruna-text-accent">Currently selected ontology:</h3>
          <p class="ms-4 font-bold max-w-2xl leading-6 text-aruna-highlight">
            {{ currentSelection ? currentSelection.label : 'None' }}
          </p>

        </div>

        <Separator v-if="currentSelection" class="my-4 bg-aruna-text/50"/>

        <div v-if="currentSelection">
          <dl>
            <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-bold leading-6 text-aruna-text-accent">Id</dt>
              <dd class="mt-1 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                {{ currentSelection.id }}
              </dd>
            </div>
            <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-bold leading-6 text-aruna-text-accent">IRI</dt>
              <dd class="mt-1 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                <NuxtLink :to="currentSelection.iri"
                          target="_blank"
                          class="hs-tooltip-toggle text-aruna-highlight hover:text-aruna-highlight/80">
                  {{ currentSelection.iri }}
                </NuxtLink>

              </dd>
            </div>
            <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-bold leading-6 text-aruna-text-accent">Description</dt>
              <dd class="mt-1 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                {{ currentSelection.description.join(' ') }}
              </dd>
            </div>
            <div class="px-4 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-bold leading-6 text-aruna-text-accent">More Information</dt>
              <dd class="inline-flex mt-1 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                <NuxtLink :to="createLandingPageLink(currentSelection.id)"
                          target="_blank"
                          class="font-semibold text-aruna-highlight hover:text-aruna-highlight/80">
                  <IconExternalLink class="size-6 flex-shrink-0"/>
                </NuxtLink>
                <NuxtLink :to="createMetadataLink(currentSelection.id)"
                          target="_blank"
                          class="font-semibold text-aruna-highlight hover:text-aruna-highlight/80">
                  <IconBraces class="ms-6 size-6 flex-shrink-0"/>
                </NuxtLink>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <!-- End display current selection -->

      <!-- COMMAND -->
      <Command class="rounded-sm border">
        <CommandInput placeholder="Search here for an ontology"
                      class="border-0 focus:border-0 outline-0 focus:outline-0 focus:ring-0"
                      @input="(event) => queryInput = event.target.value"/>
        <CommandList class="gap-y-2">
          <CommandEmpty v-if="queryInput && results.length <= 0 && fetching"
                        class="flex items-center justify-center gap-x-4">
            Fetching ontologies <IconLoader2 class="mr-2 animate-spin"/>
          </CommandEmpty>
          <CommandEmpty v-if="queryInput && results.length <= 0 && !fetching">
            No ontologies found.
          </CommandEmpty>
          <CommandItem v-for="ontology in results"
                       :value="ontology"
                       @select="selectOntology(ontology)">
            {{ ontology.label }}
          </CommandItem>
        </CommandList>
      </Command>
      <!-- END COMMAND -->

      <DialogFooter>
        <Button variant="outline"
                @click="submit"
                class="rounded-sm text-aruna-highlight border border-aruna-highlight bg-transparent hover:bg-aruna-highlight hover:text-aruna-text-accent">
          Add Ontology
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>