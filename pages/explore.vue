<script setup lang="ts">
import { v2ResourceVariant } from '@/composables/aruna_api_json';
import type { v2SearchResourcesResponse } from '@/composables/aruna_api_json';

/* Query */
const query = ref('')
function updateQuery(event: Event) {
    if (event.target != null) {
        query.value = (event.target as HTMLInputElement).value
        queryResources()
    }
}

/* Filter */
const filter = ref('')
const typeFilter = ref(v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED)
function addToFilter(condition: string) {
    if (filter.value) {
        if (filter.value.indexOf(condition) > -1) { return }

        filter.value = filter.value + " AND " + condition
    } else {
        filter.value = condition
    }
}
function setObjectTypeFilter(type: string) {
    if (type) {
        filter.value = 'object_type = ' + type
    } else {
        filter.value = ''
    }

    switch (type) {
        case 'Project': {
            typeFilter.value = v2ResourceVariant.RESOURCE_VARIANT_PROJECT
        }
        case 'Collection': {
            typeFilter.value = v2ResourceVariant.RESOURCE_VARIANT_COLLECTION
        }
        case 'Dataset': {
            typeFilter.value = v2ResourceVariant.RESOURCE_VARIANT_DATASET
        }
        case 'Object': {
            typeFilter.value = v2ResourceVariant.RESOURCE_VARIANT_OBJECT
        }
        default: {
            typeFilter.value = v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED
        }
    }
    queryResources()
}

/* Update search results list */
async function queryResources() {
    var body = `{"query":"${query.value}", "filter":"${filter.value}", "limit":"20", "offset":"0"}`
    let { data: response } = await useFetch<v2SearchResourcesResponse>('https://api.dev.aruna-storage.org/v2/search', {
        method: "POST",
        body: body
    })

    return response
}
const searchResponse = await queryResources()
</script>

<template>
    <div class="container-xl text-start mt-4">
        <div class="row mt-2">
            <div class="col-3">
                <h2 class="text-primary">Search results</h2>
                <div v-if="searchResponse" class="text-secondary">About {{ searchResponse.estimatedTotal }} results</div>
                <div v-else class="text-secondary">About 0 results</div>
            </div>
            <div class="col-9 pe-4">
                <div class="input-group">
                    <label for="formFile" class="input-group-text">
                        <div class="col-auto d-flex">
                            <svg xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-search-icon icon-tabler icon-tabler-search" width="24" height="24"
                                viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M10 10m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0"></path>
                                <path d="M21 21l-6-6"></path>
                            </svg>
                        </div>
                    </label>
                    <input type="text" class="form-control form-control-lg" placeholder="Search Aruna objects"
                        @input="updateQuery" />
                    <span class="input-group-text" id="inputGroup-sizing-default">
                        Dataclass
                    </span>
                    <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown"
                        aria-expanded="false">
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li>
                            <button class="dropdown-item">
                                All
                            </button>
                        </li>
                        <li>
                            <button class="dropdown-item">
                                Public
                            </button>
                        </li>
                        <li>
                            <button class="dropdown-item">
                                Private
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
            <div class="row">
                <div class="col-3 mt-5">
                    <h3 class="text-muted">Filters</h3>
                    <div class="subheader mb-2">Resource</div>
                    <div class="list-group list-group-transparent mb-3">
                        <button class="list-group-item list-group-item-action d-flex align-items-center"
                            :class="{ active: typeFilter === v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED }"
                            @click="() => setObjectTypeFilter('')">
                            All
                        </button>
                        <button class="list-group-item list-group-item-action d-flex align-items-center"
                            @click="() => setObjectTypeFilter('Project')"
                            :class="{ active: typeFilter === v2ResourceVariant.RESOURCE_VARIANT_PROJECT }">
                            Projects
                        </button>
                        <button class="list-group-item list-group-item-action d-flex align-items-center"
                            :class="{ active: typeFilter === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION }"
                            @click="() => setObjectTypeFilter('Collection')">
                            Collections
                        </button>
                        <button class="list-group-item list-group-item-action d-flex align-items-center"
                            :class="{ active: typeFilter === v2ResourceVariant.RESOURCE_VARIANT_DATASET }"
                            @click="() => setObjectTypeFilter('Dataset')">
                            Datasets
                        </button>
                        <button class="list-group-item list-group-item-action d-flex align-items-center"
                            :class="{ active: typeFilter === v2ResourceVariant.RESOURCE_VARIANT_OBJECT }"
                            @click="() => setObjectTypeFilter('Object')">
                            Objects
                        </button>
                    </div>
                    <div class="subheader mb-4">Filters</div>

                    <div class="input-group mb-3">
                        <input type="text" class="form-control" placeholder="Filter string" aria-label="Filter string" />
                    </div>

                    <div class="alert alert-success" role="alert">
                        <div class="alert-title">Filter arguments by value.</div>
                        <div class="text-muted mt-2">
                            E.g: <b>"size > 100"</b> , <b>"labels.key = akey"</b>
                        </div>
                        <div class="text-secondary mt-2 mb-2">
                            Current available parameters are:
                        </div>
                        <div class="text-secondary">
                            <b>size</b>
                            ,
                            <b>labels.key</b>
                            ,
                            <b>labels.value</b>
                            ,
                            <b>created_at</b>
                        </div>
                    </div>
                </div>

                <!-- Display Search Results -->
                <SearchResults :key="searchResponse" :response="searchResponse" />
            </div>
        </div>
    </div>
</template>