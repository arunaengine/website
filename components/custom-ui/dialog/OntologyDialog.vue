<script setup lang="ts">

import {v2KeyValueVariant} from "~/composables/aruna_api_json";
import {toTypedSchema} from "@vee-validate/zod";
import {z} from "zod";
import {useForm} from "vee-validate";
import {
  Dialog,
  DialogContent,
  DialogDescription, DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "~/components/ui/dialog";
import {Button} from "~/components/ui/button";
import type {OntologyDoc} from "~/composables/ts_api/OntologyDoc";
import {ComboboxAnchor} from "radix-vue";

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean,
  withButton: boolean
}>()
const externalTrigger = toRef(props, 'initialOpen')
const dialogOpen = ref(props.initialOpen)
watch(externalTrigger, () => dialogOpen.value = externalTrigger.value)
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits<{
  'add-key-value': [key: string, value: string, kvType: v2KeyValueVariant]
}>()
/* ----- END EVENT EMITS ----- */

const currentSelection: Ref<OntologyDoc | undefined> = ref(undefined);
const popoverOpen: Ref<boolean> = ref(false);

function createMetadataLink(id: string) {
  id = id.replace(':', '')
  return `https://service.tib.eu/ts4tib/api/ontologies/${id}`
}

function reset() {
  currentSelection.value = undefined;
}

function submit() {
  if (currentSelection.value) {
    emit('add-key-value',
        'http://purl.org/dc/terms/conformsTo',
        `{
          "@type": "CreativeWork",
          "@id": "${currentSelection.value.iri}",
          "url": "${createMetadataLink(currentSelection.value.id)}"
         }`,
        v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL)
    reset()
  }
}
</script>

<template>

  <Dialog v-model:open="dialogOpen">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline">
        Add Author
      </Button>
    </DialogTrigger>

    <DialogContent class="sm:max-w-[425px] sm:rounded-md"
                   @pointer-down-outside="(event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-800 font-bold">Add Ontology Definition</DialogTitle>
        <DialogDescription class="text-center">
          Add an ontology definition to the resource.
        </DialogDescription>
      </DialogHeader>

      <Popover v-model:open="popoverOpen">
        <PopoverTrigger as-child>
          <Button
              variant="outline"
              role="combobox"
              :aria-expanded="popoverOpen"
              class="w-[200px] justify-between"
          >
            {{ value
              ? frameworks.find((framework) => framework.value === value)?.label
              : "Select framework..." }}
            <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-[200px] p-0">
          <Command>
            <CommandInput class="h-9" placeholder="Search framework..." />
            <CommandEmpty>No framework found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                <CommandItem
                    v-for="framework in frameworks"
                    :key="framework.value"
                    :value="framework.value"
                    @select="(ev) => {
                if (typeof ev.detail.value === 'string') {
                  value = ev.detail.value
                }
                popoverOpen = false
              }"
                >
                  {{ framework.label }}
                  <Check
                      :class="cn(
                  'ml-auto h-4 w-4',
                  value === framework.value ? 'opacity-100' : 'opacity-0',
                )"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <DialogFooter>
        <Button
            type="submit"
            :disabled="currentSelection === undefined"
            class="bg-aruna-800 hover:bg-aruna-700">
          Add Ontology
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>