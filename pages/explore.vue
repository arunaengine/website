<script lang="ts" setup>
import {v2ResourceVariant, type v2GenericResource} from "~/composables/aruna_api_json";
import {
  IconFile,
  IconFiles,
  IconFolder,
  IconFolders,
  IconSearch,
  IconWorldSearch,
} from "@tabler/icons-vue";
import {Button} from '@/components/ui/button'
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

import {searchResources} from "~/composables/api_wrapper";

const currentPage: Ref<number> = ref(1);
const limit: Ref<number> = ref(20);
const hits: Ref<v2GenericResource[]> = ref([]);
const estimatedTotal = ref(0);

/* Query */
const query = ref("");
watch(query, async () => {
  await queryResources(true)
});

/* Filter */
const filter = ref("object_type = PROJECT");
const typeFilter = ref(v2ResourceVariant.RESOURCE_VARIANT_PROJECT);
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
    case v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED: {
      filter.value = "";
      break;
    }
    case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
      filter.value = "object_type = PROJECT";
      break;
    }
    case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: {
      filter.value = "object_type = COLLECTION";
      break;
    }
    case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
      filter.value = "object_type = DATASET";
      break;
    }
    case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
      filter.value = "object_type = OBJECT";
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
    const response = await searchResources(body)

    customFilterValid.value = true;
    hits.value = response.resources ? response.resources : [];
    estimatedTotal.value = response.estimatedTotal
        ? Number(response.estimatedTotal)
        : 0;
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
        <h2 class="text-2xl font-bold text-white">
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
            <input type="text"
                   v-model="query"
                   id="search-query-input-with-icon"
                   name="search-query-input-with-icon"
                   class="py-3 px-4 pe-11 block w-full border-gray-700 shadow-sm rounded-s-md text-sm focus:z-10 focus:border-slate-300-50 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none bg-slate-900 text-gray-300"
                   placeholder="Search Aruna Resources"/>
            <button type="button"
                    class="w-[2.875rem] h-[2.875rem] flex-shrink-0 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-e-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-aruna-700">
              <IconSearch class="flex-shrink-0 size-6"/>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- End Hits + Search Input -->

    <div class="flex flex-col md:flex-row md:container w-full mx-auto my-5 border-t pt-4">
      <div class="md:basis-1/4 sm:w-[90vw] sm:mx-auto border-r px-2">
        <h3 class="text-xl font-bold text-white">Filters</h3>

        <div class="grid space-y-1 mt-4 items-center">
          <p class="text-sm uppercase text-white">
            Resource Type
          </p>

          <label for="resource-type-all"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-slate-900 border border-gray-700 rounded-md text-sm focus:border-aruna-700 focus:ring-aruna-700 text-gray-300">
            <input v-model="typeFilter"
                   id="resource-type-all"
                   class="shrink-0 mt-0.5 border-gray-700 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none bg-gray-800 checked:bg-aruna-800 checked:border-aruna-800 focus:ring-offset-gray-800"
                   name="resource-type-select" type="radio"
                   :value="v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED"/>
            <IconWorldSearch class="flex-shrink-0 size-5 mx-2 text-gray-300 ms-5"/>
            <span class="text-sm text-gray-300">All</span>
          </label>

          <label for="resource-type-projects"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-slate-900 border border-gray-700 rounded-md text-sm focus:border-aruna-700 focus:ring-aruna-700 text-gray-300">
            <input type="radio"
                   v-model="typeFilter"
                   :value="v2ResourceVariant.RESOURCE_VARIANT_PROJECT"
                   checked
                   id="resource-type-projects"
                   name="resource-type-select"
                   class="shrink-0 mt-0.5 border-gray-700 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none bg-gray-800 checked:bg-aruna-800 checked:border-aruna-800 focus:ring-offset-gray-800"/>
            <IconFolders class="flex-shrink-0 size-5 mx-2 text-gray-300 ms-5"/>
            <span class="text-sm text-gray-300">Projects</span>
          </label>

          <label for="resource-type-collections"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-slate-900 border border-gray-700 rounded-md text-sm focus:border-aruna-700 focus:ring-aruna-700 text-gray-300">
            <input v-model="typeFilter" id="resource-type-collections"
                   class="shrink-0 mt-0.5 border-gray-700 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none bg-gray-800 checked:bg-aruna-800 checked:border-aruna-800 focus:ring-offset-gray-800"
                   name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_COLLECTION"/>
            <IconFolder class="flex-shrink-0 size-5 mx-2 text-gray-300 ms-5"/>
            <span class="text-sm text-gray-300">Collections</span>
          </label>

          <label for="resource-type-datasets"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-slate-900 border border-gray-700 rounded-md text-sm focus:border-aruna-700 focus:ring-aruna-700 text-gray-300">
          <input v-model="typeFilter" id="resource-type-datasets"
                 class="shrink-0 mt-0.5 border-gray-700 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none bg-gray-800 checked:bg-aruna-800 checked:border-aruna-800 focus:ring-offset-gray-800"
                   name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_DATASET"/>
            <IconFiles class="flex-shrink-0 size-5 mx-2 text-gray-300 ms-5"/>
            <span class="text-sm text-gray-300">Datasets</span>
          </label>

          <label for="resource-type-objects"
                 class="cursor-pointer max-w-xs flex p-3 w-full bg-slate-900 border border-gray-700 rounded-md text-sm focus:border-aruna-700 focus:ring-aruna-700 text-gray-300">
          <input v-model="typeFilter" id="resource-type-objects"
                 class="shrink-0 mt-0.5 border-gray-700 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none bg-gray-800 checked:bg-aruna-800 checked:border-aruna-800 focus:ring-offset-gray-800"
                   name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_OBJECT"/>
            <IconFile class="flex-shrink-0 size-5 mx-2 text-gray-300 ms-5"/>
            <span class="text-sm text-gray-300">Objects</span>
          </label>
        </div>

        <!-- Start Custom Filter -->
        <p class="mt-6 mb-2 text-sm uppercase text-white">
          Custom Filter
        </p>
        <input v-model="customFilter" @keyup.enter="queryResources(true)" type="text"
               class="py-3 px-4 block w-full rounded-md bg-slate-900 border-gray-700 text-gray-300 text-sm focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none"
               placeholder="Custom filter"/>

        <div
            class="my-6 rounded-md bg-slate-900 border border-l-4 border-gray-700 border-l-aruna-700 shadow-sm shadow-slate-700/[.7]">
          <div class="p-4 md:p-5">
            <h3 class="font-bold text-white">
              Filter arguments by value.
            </h3>
            <p class="mt-2 text-sm text-gray-300">
              E.g: <strong>size > 1024</strong> or
              <strong>labels.key = some-key</strong>
            </p>
            <div class="mt-2 text-sm text-gray-300">
              The currently available parameters to create custom filters can be
              looked up in the
              <NuxtLink to="https://arunastorage.github.io/documentation/latest/get_started/basic_usage/12_How-To-Search/"
                        rel="noreferrer"
                        target="_blank"
                        class="text-aruna-700">
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
            <PaginationFirst class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-gray-900"/>
            <PaginationPrev class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-slate-900"/>
            <template v-for="(item, index) in items">
              <PaginationListItem v-if="item.type === 'page'"
                                  :key="index"
                                  :value="item.value"
                                  class="rounded-sm"
                                  as-child>
                <Button @click="paginate(item.value)"
                        class="w-8 h-8 p-0 rounded-sm"
                        :class="cn('text-white border-gray-400', item.value === page ? 'bg-aruna-700' : 'bg-aruna-800')"
                        :variant="item.value === page ? 'default' : 'outline'">
                  {{ item.value }}
                </Button>
              </PaginationListItem>
              <PaginationEllipsis v-else :key="item.type" :index="index"/>
            </template>
            <PaginationNext class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-gray-900"/>
            <PaginationLast class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-gray-900"/>
          </PaginationList>
        </Pagination>

        <!-- Start Display Search Results -->
        <SearchResults :key="hits" :resources="hits"/>
        <!-- End Display Search Results -->

        <Pagination v-if="estimatedTotal > limit"
                    v-slot="{ page }"
                    :total="estimatedTotal"
                    v-model:page="currentPage"
                    :items-per-page="limit"
                    :sibling-count="1"
                    :default-page="1"
                    show-edges>
          <PaginationList v-slot="{ items }" class="my-4 flex items-center gap-1">
            <PaginationFirst class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-gray-900"/>
            <PaginationPrev class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-slate-900"/>
            <template v-for="(item, index) in items">
              <PaginationListItem v-if="item.type === 'page'"
                                  :key="index"
                                  :value="item.value"
                                  class="rounded-sm"
                                  as-child>
                <Button @click="paginate(item.value)"
                        class="w-8 h-8 p-0 rounded-sm"
                        :class="cn('text-white border-gray-400', item.value === page ? 'bg-aruna-700' : 'bg-aruna-800')"
                        :variant="item.value === page ? 'default' : 'outline'">
                  {{ item.value }}
                </Button>
              </PaginationListItem>
              <PaginationEllipsis v-else :key="item.type" :index="index"/>
            </template>
            <PaginationNext class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-gray-900"/>
            <PaginationLast class="w-8 h-8 p-0 rounded-sm border-gray-400 bg-gray-900"/>
          </PaginationList>
        </Pagination>
      </div>
    </div>
  </div>

  <Footer/>
</template>