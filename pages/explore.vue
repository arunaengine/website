<script lang="ts" setup>
import {
  IconFile,
  IconFolder,
  IconFolders,
  IconSearch,
  IconWorldSearch,
} from "@tabler/icons-vue";
import {
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationLast,
  PaginationList,
  PaginationListItem,
  PaginationNext,
  PaginationPrev,
} from '@/components/ui/pagination'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {ResourceVariant} from "~/types/aruna-v3-enums";

import {searchResources} from "~/composables/api_wrapper";

const currentPage: Ref<number> = ref(1);
const limit: Ref<number> = ref(20);
const hits: Ref<Resource[]> = ref([]);
const estimatedTotal = ref(0);
const fetching = ref(false);

const debouncedInput = debounce(async () => await queryResources(true), 250)

/* Query */
const query = ref("");
watch(query, async () => {
  fetching.value = true;
  await debouncedInput()
});

/* Filter */
const filter = ref("variant=0");
const typeFilter = ref(ResourceVariant.Project);
const customFilter = ref("");
const customFilterValid = ref(true);

watch(customFilter, () => generateFilter());
watch(typeFilter, async () => {
  generateFilter();
  await queryResources(true);
  currentPage.value = 1
});

function generateFilter() {
  switch (typeFilter.value) {
    case null: {
      filter.value = "";
      break;
    }
    case ResourceVariant.Project: {
      filter.value = "variant=0";
      break;
    }
    case ResourceVariant.Folder: {
      filter.value = "variant=1";
      break;
    }
    case ResourceVariant.Object: {
      filter.value = "variant=2";
      break;
    }
  }

  if (customFilter.value.length > 0) {
    if (filter.value.length > 0) {
      filter.value += ` AND ${customFilter.value}`;
    } else {
      filter.value = customFilter.value;
    }
  }
}

/* Update search results list */
async function queryResources(pageReset: boolean) {
  if (pageReset) {
    currentPage.value = 1
  }

  const offset = (currentPage.value - 1) * limit.value;
  const body = JSON.stringify({
    query: query.value,
    filter: filter.value,
    limit: limit.value,
    offset: offset,
  })

  try {
    //const response = await searchResources(body)
    const response = await $fetch<SearchResponse>('/api/v3/search', {
      query: {
        query: query.value,
        limit: limit.value,
        filter: filter.value,
        offset: offset,
      }
    }).catch(error => {
      console.error(error)
      throw new Error("Resource search failed.")
    })

    customFilterValid.value = true;
    hits.value = response.resources ? response.resources : [];
    console.log(hits.value);
    estimatedTotal.value = response.expected_hits
        ? Number(response.expected_hits)
        : 0;
    fetching.value = false;
  } catch (error) {
    console.warn(error);
    customFilterValid.value = false;
    hits.value = [];
  }
}

function paginate(requestedPage: number) {
  currentPage.value = requestedPage
  queryResources(false)
}

onMounted(async () => await queryResources(true));
</script>

<template>
  <NavigationTop/>

  <div class="min-h-[calc(100vh-110px)]">
    <!-- Start Hits + Search Input -->
    <div class="flex flex-col md:flex-row items-center md:container w-full mx-auto mt-10">
      <div class="md:basis-1/4">
        <h2 class="text-2xl font-bold text-aruna-text-accent">
          Search results
        </h2>
        <div class="mt-2 text-gray-400">
          About {{ estimatedTotal }} results
        </div>
      </div>
      <div class="mt-3 md:mt-0 w-[90vw] mx-2 md:mx-0 md:basis-3/4">
        <div>
          <label class="sr-only" for="search-query-input-with-icon">Search query input</label>
          <div class="flex rounded-md shadow-sm">
            <!-- <Input type="text"
                   id="search-query-input-with-icon"
                   v-model="query"
                   name="search-query-input-with-icon"
                   placeholder="Search Aruna Resources"
            />
            <Button type="button">
              <IconSearch class="flex-shrink-0 size-6"/>
            </Button> -->
            <input type="text"
                   v-model="query"
                   id="search-query-input-with-icon"
                   name="search-query-input-with-icon"
                   class="py-3 px-4 pe-11 block w-full border-e-0 border-aruna-text/50 rounded-s-md text-sm focus:z-10 focus:ring-1 focus:ring-aruna-highlight focus:border-aruna-highlight disabled:opacity-50 disabled:pointer-events-none bg-aruna-bg/90 text-aruna-text"
                   placeholder="Search Aruna Resources"/>
                 <button type="button"
                    class="w-[2.875rem] h-[2.875rem] flex-shrink-0 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-e-md border border-aruna-highlight bg-aruna-bg/90 text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
              <IconSearch class="flex-shrink-0 size-6"/>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- End Hits + Search Input -->

    <div class="flex flex-col md:flex-row md:container w-full mx-auto my-5 border-t pt-4">
      <div class="md:basis-1/4 sm:w-[90vw] sm:mx-auto border-r px-2">
        <h3 class="text-xl font-bold text-aruna-text-accent">Filters</h3>

        <div class="grid space-y-1 mt-4 items-center">
          <p class="text-sm uppercase text-aruna-text-accent">
            Resource Type
          </p>

          <label for="resource-type-all"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-aruna-bg/90 border border-aruna-text/50 rounded-md text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight text-aruna-text">
            <input type="radio"
                   v-model="typeFilter"
                   :value="null"
                   id="resource-type-all"
                   name="resource-type-select"
                   class="shrink-0 mt-0.5 border-aruna-text/50 rounded-full text-aruna-highlight focus:ring-0 disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted checked:bg-aruna-highlight checked:border-aruna-muted focus:ring-offset-0"/>
            <IconWorldSearch class="flex-shrink-0 size-5 mx-2 text-aruna-text ms-5"/>
            <span class="text-sm text-aruna-text">All</span>
          </label>

          <label for="resource-type-projects"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-aruna-bg/90 border border-aruna-text/50 rounded-md text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight text-aruna-text">
            <input type="radio"
                   checked
                   v-model="typeFilter"
                   :value="ResourceVariant.Project"
                   id="resource-type-projects"
                   name="resource-type-select"
                   class="shrink-0 mt-0.5 border-aruna-text/50 rounded-full text-aruna-highlight focus:ring-0 disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted checked:bg-aruna-highlight checked:border-aruna-muted focus:ring-offset-0"/>
            <IconFolders class="flex-shrink-0 size-5 mx-2 text-aruna-text ms-5"/>
            <span class="text-sm text-aruna-text">Projects</span>
          </label>

          <label for="resource-type-collections"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-aruna-bg/90 border border-aruna-text/50 rounded-md text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight text-aruna-text">
            <input type="radio"
                   v-model="typeFilter"
                   :value="ResourceVariant.Folder"
                   id="resource-type-collections"
                   name="resource-type-select"
                   class="shrink-0 mt-0.5 border-aruna-text/50 rounded-full text-aruna-highlight focus:ring-0 disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted checked:bg-aruna-highlight checked:border-aruna-muted focus:ring-offset-0"/>
            <IconFolder class="flex-shrink-0 size-5 mx-2 text-aruna-text ms-5"/>
            <span class="text-sm text-aruna-text">Folder</span>
          </label>

          <label for="resource-type-objects"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-aruna-bg/90 border border-aruna-text/50 rounded-md text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight text-aruna-text">
            <input type="radio"
                   v-model="typeFilter"
                   :value="ResourceVariant.Object"
                   id="resource-type-objects"
                   name="resource-type-select"
                   class="shrink-0 mt-0.5 border-aruna-text/50 rounded-full text-aruna-highlight focus:ring-0 disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted checked:bg-aruna-highlight checked:border-aruna-muted focus:ring-offset-0"/>
            <IconFile class="flex-shrink-0 size-5 mx-2 text-aruna-text ms-5"/>
            <span class="text-sm text-aruna-text">Objects</span>
          </label>
        </div>

        <!-- Start Custom Filter -->
        <p class="mt-6 mb-2 text-sm uppercase text-aruna-text-accent">
          Custom Filter
        </p>
        <input type="text"
               v-model="customFilter"
               @keyup.enter="queryResources(true)"
               class="py-3 px-4 block w-full rounded-md bg-aruna-bg/90 border-aruna-text/50 text-aruna-text text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none"
               placeholder="Custom filter"/>

        <div class="my-6 rounded-md bg-aruna-muted border border-aruna-text/50 border-t-4 border-t-aruna-highlight">
          <div class="p-4 md:p-5">
            <h3 class="font-bold text-aruna-text-accent">
              Filter arguments by value.
            </h3>
            <p class="mt-2 text-sm text-aruna-text">
              E.g: <strong class="text-aruna-text-accent">size > 1024</strong> or
              <strong class="text-aruna-text-accent">labels.key = some-key</strong>
            </p>
            <div class="mt-2 text-sm text-aruna-text">
              The currently available parameters to create custom filters can be
              looked up in the
              <NuxtLink to="https://docs.aruna-engine.org/latest/get_started/basic_usage/12_How-To-Search/"
                        rel="noreferrer"
                        target="_blank"
                        class="text-aruna-highlight hover:text-aruna-highlight/80">
                documentation
              </NuxtLink>
              .
            </div>
          </div>
        </div>
        <!-- End Custom Filter -->
      </div>

      <div class="p-4 sm:mt-3 md:basis-3/4 md:mt-0">
        <Pagination v-if="estimatedTotal > limit"
                    v-slot="{ page }"
                    :total="estimatedTotal"
                    v-model:page="currentPage"
                    :items-per-page="limit"
                    :sibling-count="1"
                    :default-page="1"
                    @update:page="value => {
                      currentPage = value
                      queryResources(false)
                    }"
                    show-edges>
          <PaginationList v-slot="{ items }" class="my-4 flex items-center gap-1">
            <PaginationFirst class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
            <PaginationPrev class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
            <template v-for="(item, index) in items">
              <PaginationListItem v-if="item.type === 'page'"
                                  :key="index"
                                  :value="item.value"
                                  class="rounded-sm"
                                  as-child>
                <Button @click="paginate(item.value)"
                        class="w-8 h-8 p-0 rounded-sm hover:bg-aruna-muted"
                        :class="cn(
                            'text-aruna-text-accent border-aruna-text',
                            item.value === page ? 'bg-aruna-highlight hover:border hover:border-aruna-highlight' : 'bg-aruna-fg'
                        )"
                        :variant="item.value === page ? 'default' : 'outline'">
                  {{ item.value }}
                </Button>
              </PaginationListItem>
              <PaginationEllipsis v-else :key="item.type" :index="index"/>
            </template>
            <PaginationNext class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
            <PaginationLast class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
          </PaginationList>
        </Pagination>

        <!-- Start Display Search Results -->
        <SearchResults :resources="hits" :fetching="fetching"/>
        <!-- End Display Search Results -->

        <Pagination v-if="estimatedTotal > limit"
                    v-slot="{ page }"
                    :total="estimatedTotal"
                    v-model:page="currentPage"
                    :items-per-page="limit"
                    :sibling-count="1"
                    :default-page="1"
                    @update:page="value => {
                      currentPage = value
                      queryResources(false)
                    }"
                    show-edges>
          <PaginationList v-slot="{ items }" class="my-4 flex items-center gap-1">
            <PaginationFirst class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
            <PaginationPrev class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
            <template v-for="(item, index) in items">
              <PaginationListItem v-if="item.type === 'page'"
                                  :key="index"
                                  :value="item.value"
                                  class="rounded-sm"
                                  as-child>
                <Button @click="paginate(item.value)"
                        class="w-8 h-8 p-0 rounded-sm hover:bg-aruna-muted hover:border-aruna-text"
                        :class="cn(
                            'text-aruna-text-accent',
                            item.value === page ? 'bg-aruna-highlight hover:border hover:border-aruna-highlight' : 'bg-aruna-fg'
                        )"
                        :variant="item.value === page ? 'default' : 'outline'">
                  {{ item.value }}
                </Button>
              </PaginationListItem>
              <PaginationEllipsis v-else :key="item.type" :index="index"/>
            </template>
            <PaginationNext class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
            <PaginationLast class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
          </PaginationList>
        </Pagination>
      </div>
    </div>
  </div>

  <Footer/>
</template>