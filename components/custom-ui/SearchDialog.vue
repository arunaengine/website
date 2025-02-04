<script setup lang="ts">

import {IconLoader2, IconSearch} from "@tabler/icons-vue";
import {GenericNodeType, ResourceVariant} from "~/types/aruna-v3-enums";

const DEFAULT_LIMIT = 4;

const router = useRouter()

const queryInput = ref('')
const fetching = ref(false)
const response: Ref<SearchResponse | undefined | void> = ref(undefined)
const dialogOpen = ref(false)
const resources: Ref<SplitResources | undefined> = ref(undefined)

function handleDialogOpenChange() {
  dialogOpen.value = !dialogOpen.value
}

// Debounce input to decrease number of requests
watch(queryInput, () => {
  // Empty input only clears results
  if (!queryInput.value) {
    response.value = undefined
    return
  }

  fetching.value = true
  response.value = undefined
  debouncedInput()
})

const debouncedInput = debounce(async () => await searchResources(queryInput.value), 250)

async function searchResources(query: string): Promise<void> {
  // No need to search with empty input
  if (!query) {
    response.value = undefined
    return
  }

  response.value = await $fetch<SearchResponse>('/api/v3/search', {
    query: {
      query: query,
      limit: DEFAULT_LIMIT
    }
  }).catch(error => {
    console.log(error)
    return
  })
  fetching.value = false
  dialogOpen.value = true
}

watch(response, () => {
  resources.value = splitResources(response.value?.resources)
})

type SplitResources = {
  projects: Resource[],
  folders: Resource[],
  objects: Resource[],
  other: any[],
}

function splitResources(resources: (Resource & { [type: string]: GenericNodeType })[]): SplitResources {
  var result: SplitResources = {
    projects: [],
    folders: [],
    objects: [],
    other: []
  }
  console.log(resources);
  console.log(response.value?.expected_hits);
  for (const resource of resources) {
    if (resource.type === GenericNodeType.Resource) {
      switch (resource.variant) {
        case ResourceVariant.Project:
          result.projects.push(resource)
          break;
        case ResourceVariant.Folder:
          result.folders.push(resource)
          break;
        case ResourceVariant.Object:
          result.objects.push(resource)
          break;
      }
    } else {
      result.other.push(resource)
    }
  }
  return result
}

</script>

<template>
  <div class="relative flex">
    <Button @click="dialogOpen=true">
      <IconSearch class="mr-1 h-4 w-4 text-muted-foreground"/>
      Search
    </Button>

    <!-- COMMAND DIALOG -->
    <CommandDialog class="rounded-sm border" :open="dialogOpen" @update:open="handleDialogOpenChange">
      <CommandInput placeholder="Search for resources"
                    class="border-0 focus:border-0 outline-0 focus:outline-0 focus:ring-0"
                    @input="(event) => queryInput = event.target.value"/>
      <CommandList class="gap-y-2">
        <CommandEmpty v-if="queryInput && fetching"
                      class="flex items-center justify-center gap-x-4">
          Fetching results
          <IconLoader2 class="mr-2 animate-spin"/>
        </CommandEmpty>
        <CommandEmpty v-if="queryInput && !fetching">
          No results found.
        </CommandEmpty>
        <CommandGroup heading="Projects">
          <CommandItem v-for="resource in resources?.projects"
                       :value="resource"
                       @select="router.push('/projects/' + resource.id)"> <!-- Dummy, replace with proper path later -->
            {{ resource.name }}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Folders">
          <CommandItem v-for="resource in resources?.folders"
                       :value="resource">
            {{ resource.name }}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Objects">
          <CommandItem v-for="resource in resources?.objects"
                       :value="resource">
            {{ resource.name }}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Others">
          <CommandItem v-for="resource in resources?.other"
                       :value="resource">
            {{ resource.type + ": " + resource.name }}
          </CommandItem>
        </CommandGroup>
        <!-- <CommandItem disabled v-if="response?.expected_hits > DEFAULT_LIMIT" :value="'load more'">...</CommandItem>

        </CommandItem> -->
      </CommandList>
      <Button v-if="response?.expected_hits > DEFAULT_LIMIT">
        Show all results
      </Button>
    </CommandDialog>
    <!-- END COMMAND DIALOG-->
  </div>
</template>