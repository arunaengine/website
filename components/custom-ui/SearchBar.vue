<script setup lang="ts">

import {IconLoader2, IconSearch} from "@tabler/icons-vue";

const queryInput = ref('')
const fetching = ref(false)
const response: Ref<SearchResponse | undefined | void> = ref(undefined) //ref([{label: 'test'}, {label: 'test2'}, {label: 'test3'}])

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
      query: query
    }
  }).catch(error => {
    console.log(error)
    return
  })
  fetching.value = false
}

</script>

<template>
  <div class="relative flex">
    <IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
    <!-- COMMAND -->
    <Command class="rounded-sm border">
      <CommandInput placeholder="Search for resources"
                    class="border-0 focus:border-0 outline-0 focus:outline-0 focus:ring-0"
                    @input="(event) => queryInput = event.target.value"/>
      <CommandList class="gap-y-2">
        <CommandEmpty v-if="queryInput && response?.resources.length <= 0 && fetching"
                      class="flex items-center justify-center gap-x-4">
          Fetching results <IconLoader2 class="mr-2 animate-spin"/>
        </CommandEmpty>
        <CommandEmpty v-if="queryInput && response?.resources.length <= 0 && !fetching">
          No results found.
        </CommandEmpty>
        <CommandItem v-for="resource in response?.resources"
                     :value="resource">
          {{ resource.id }}
        </CommandItem>
      </CommandList>
    </Command>
    <!-- END COMMAND -->
  </div>
</template>