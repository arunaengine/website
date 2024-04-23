<script lang="ts" setup>
import { v2ResourceVariant } from "@/composables/aruna_api_json";
import type {
  v2GenericResource,
  v2SearchResourcesResponse,
} from "@/composables/aruna_api_json";
import {
  IconFile,
  IconFiles,
  IconFolder,
  IconFolders,
  IconSearch,
  IconWorldSearch,
} from "@tabler/icons-vue";
import {searchResources} from "~/composables/api_wrapper";

const page = ref(1);
const limit = ref(20);
const hits: Ref<v2GenericResource[]> = ref([]);
const estimatedTotal = ref(0);

/* Query */
const query = ref("");

async function updateQuery(event: Event) {
  if (event.target != null) {
    query.value = (event.target as HTMLInputElement).value;
    await queryResources();
  }
}

watch(query, async () => await queryResources());

/* Filter */
const filter = ref("");
const typeFilter = ref(v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED);
const customFilter = ref("");
const customFilterValid = ref(true);

watch(customFilter, () => {
  generateFilter()
});

watch(typeFilter, async () => {
  generateFilter();
  await queryResources();
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
async function queryResources() {
  const offset = (page.value - 1) * limit.value;
  const body = `{"query":"${query.value}", "filter":"${filter.value}", "limit":"${limit.value}", "offset":"${offset}"}`;

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

const paginationClickHandler = (page: number) => {
  console.log(page);
  queryResources()
};

onMounted(async () => await queryResources());
</script>

<template>
  <NavigationTop />

  <!-- Start Hits + Search Input -->
  <div class="flex sm:flex-col md:flex-row items-center md:container w-full mx-auto mt-10">
    <div class="md:basis-1/4">
      <h2 class="text-2xl font-bold text-aruna-800 dark:text-white">
        Search results
      </h2>
      <div class="mt-2 dark:text-gray-400 text-gray-600">
        About {{ estimatedTotal }} results
      </div>
    </div>
    <div class="md:basis-3/4 sm:mt-3 md:mt-0">
      <div>
        <label class="sr-only" for="hs-trailing-button-add-on-with-icon">Label</label>
        <div class="flex rounded-lg shadow-sm">
          <input v-model="query" id="hs-trailing-button-add-on-with-icon"
            class="py-3 px-4 pe-11 block w-full border-gray-200 shadow-sm rounded-s-lg text-sm focus:z-10 focus:border-slate-300-50 focus:ring-slate-300 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
            name="hs-trailing-button-add-on-with-icon" placeholder="Search Aruna Objects" type="text" />

          <button
            class="w-[2.875rem] h-[2.875rem] flex-shrink-0 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-e-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            type="button">
            <IconSearch class="flex-shrink-0 size-6" />
          </button>
        </div>
      </div>
    </div>
  </div>
  <!-- End Hits + Search Input -->

  <div class="flex sm:flex-col md:flex-row md:container w-full mx-auto my-5 border-t pt-4">
    <div class="md:basis-1/4 sm:w-[90vw] sm:mx-auto border-r px-2">
      <h3 class="text-xl font-bold text-slate-500 dark:text-white">Filters</h3>

      <div class="grid space-y-1 mt-4 items-center">
        <p class="text-sm uppercase text-slate-500 dark:text-white">
          Resource Type
        </p>

        <label
          class="cursor-pointer max-w-xs flex p-3 w-full bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
          for="resource-type-all">
          <input v-model="typeFilter" id="resource-type-all"
            class="shrink-0 mt-0.5 border-gray-200 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-gray-800 dark:border-gray-700 dark:checked:bg-aruna-800 dark:checked:border-aruna-800 dark:focus:ring-offset-gray-800"
            name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED" checked />
          <IconWorldSearch class="flex-shrink-0 size-5 mx-2 text-gray-500 ms-5 dark:text-gray-400" />
          <span class="text-sm text-gray-500 dark:text-gray-400">All</span>
        </label>

        <label
          class="cursor-pointer max-w-xs flex p-3 w-full bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
          for="resource-type-projects">
          <input v-model="typeFilter" id="resource-type-projects"
            class="shrink-0 mt-0.5 border-gray-200 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-gray-800 dark:border-gray-700 dark:checked:bg-blue-500 dark:checked:border-blue-500 dark:focus:ring-offset-gray-800"
            name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_PROJECT" />
          <IconFolders class="flex-shrink-0 size-5 mx-2 text-gray-500 ms-5 dark:text-gray-400" />
          <span class="text-sm text-gray-500 dark:text-gray-400">Projects</span>
        </label>

        <label
          class="cursor-pointer max-w-xs flex p-3 w-full bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
          for="resource-type-collections">
          <input v-model="typeFilter" id="resource-type-collections"
            class="shrink-0 mt-0.5 border-gray-200 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-gray-800 dark:border-gray-700 dark:checked:bg-blue-500 dark:checked:border-blue-500 dark:focus:ring-offset-gray-800"
            name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_COLLECTION" />
          <IconFolder class="flex-shrink-0 size-5 mx-2 text-gray-500 ms-5 dark:text-gray-400" />
          <span class="text-sm text-gray-500 dark:text-gray-400">Collections</span>
        </label>

        <label
          class="cursor-pointer max-w-xs flex p-3 w-full bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
          for="resource-type-datasets">
          <input v-model="typeFilter" id="resource-type-datasets"
            class="shrink-0 mt-0.5 border-gray-200 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-gray-800 dark:border-gray-700 dark:checked:bg-blue-500 dark:checked:border-blue-500 dark:focus:ring-offset-gray-800"
            name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_DATASET" />
          <IconFiles class="flex-shrink-0 size-5 mx-2 text-gray-500 ms-5 dark:text-gray-400" />
          <span class="text-sm text-gray-500 dark:text-gray-400">Datasets</span>
        </label>

        <label
          class="cursor-pointer max-w-xs flex p-3 w-full bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400"
          for="resource-type-objects">
          <input v-model="typeFilter" id="resource-type-objects"
            class="shrink-0 mt-0.5 border-gray-200 rounded-full text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-gray-800 dark:border-gray-700 dark:checked:bg-blue-500 dark:checked:border-blue-500 dark:focus:ring-offset-gray-800"
            name="resource-type-select" type="radio" :value="v2ResourceVariant.RESOURCE_VARIANT_OBJECT" />
          <IconFile class="flex-shrink-0 size-5 mx-2 text-gray-500 ms-5 dark:text-gray-400" />
          <span class="text-sm text-gray-500 dark:text-gray-400">Objects</span>
        </label>
      </div>

      <!-- Start Custom Filter -->
      <p class="mt-6 mb-2 text-sm uppercase text-slate-500 dark:text-white">
        Custom Filter
      </p>
      <input v-model="customFilter" @keyup.enter="queryResources" type="text"
        class="py-3 px-4 block w-full border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
        placeholder="Custom filter" />

      <div
        class="my-6 bg-white border border-l-4 border-l-aruna-700 shadow-sm rounded-xl dark:bg-slate-900 dark:border-gray-700 dark:border-t-blue-500 dark:shadow-slate-700/[.7]">
        <div class="p-4 md:p-5">
          <h3 class="font-bold text-aruna-800 dark:text-white">
            Filter arguments by value.
          </h3>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            E.g: <strong>size > 1024</strong> or
            <strong>labels.key = akey</strong>
          </p>
          <div class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            The currently available parameters to create custom filters can be
            looked up in the
            <NuxtLink class="text-aruna-800 dark:text-aruna-600" rel="noreferrer" target="_blank"
              to="https://arunastorage.github.io/documentation/latest/get_started/basic_usage/12_How-To-Search/">
              documentation
            </NuxtLink>
            .
          </div>
        </div>
      </div>
      <!-- End Custom Filter -->
    </div>

    <div class="p-4 sm:mt-3 md:basis-3/4 md:mt-0">
      <vue-awesome-paginate :total-items="estimatedTotal" :items-per-page="20" :max-pages-shown="5"
        v-model="page" :on-click="paginationClickHandler" />

      <!-- Start Display Search Results -->
      <SearchResults :key="hits" :resources="hits" />
      <!-- End Display Search Results -->

      <vue-awesome-paginate v-if="estimatedTotal > 20" :total-items="estimatedTotal" :items-per-page="20" :max-pages-shown="5"
                            v-model="page" :on-click="paginationClickHandler" />
    </div>
  </div>
  
  <Footer />
</template>

<style>
.pagination-container {
  display: flex;
  column-gap: 10px;
}

.paginate-buttons {
  height: 24px;
  width: 24px;
  border-radius: 8px;
  cursor: pointer;
  background-color: #007bc2;
  font-size: x-small;
  /*border: 1px solid #005299;*/
  color: white;
}

.paginate-buttons:hover {
  background-color: #00A0CC;
}

.active-page {
  background-color: #3498db;
  border: 1px solid #3498db;
  color: white;
}

.active-page:hover {
  background-color: #007BC2;
}
</style>