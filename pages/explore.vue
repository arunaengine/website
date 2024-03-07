<script setup lang="ts">
import { v2ResourceVariant } from '@/composables/aruna_api_json';
import type { v2GenericResource, v2SearchResourcesResponse } from '@/composables/aruna_api_json';
import { IconFile, IconFiles, IconFolder, IconFolders, IconSearch, IconWorldSearch } from '@tabler/icons-vue';

const page = ref(1)
const limit = ref(20)
const hits: Ref<v2GenericResource[]> = ref([])
const estimatedTotal = ref(0)

/* Query */
const query = ref('')
async function updateQuery(event: Event) {
    if (event.target != null) {
        query.value = (event.target as HTMLInputElement).value
        await queryResources()
    }
}

watch(query, async () => await queryResources())

/* Filter */
const filter = ref('')
const typeFilter = ref(v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED)
const customFilter = ref('')
function addToFilter(condition: string) {
    if (filter.value) {
        if (filter.value.indexOf(condition) > -1) { return }

        filter.value = filter.value + " AND " + condition
    } else {
        filter.value = condition
    }
}

watch(typeFilter, async (n) => {
    generateFilter()
    await queryResources()
})

function generateFilter() {
    switch (typeFilter.value) {
        case v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED: {
            filter.value = ''
            break
        }
        case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
            filter.value = 'object_type = PROJECT'
            break
        }
        case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: {
            filter.value = 'object_type = COLLECTION'
            break
        }
        case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
            filter.value = 'object_type = DATASET'
            break
        }
        case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
            filter.value = 'object_type = OBJECT'
        }
    }

    if (customFilter.value.length > 0) {
        if (filter.value.length > 0) {
            filter.value += ` AND ${customFilter.value}`
        } else {
            filter.value = customFilter.value
        }
    }
}

/* Update search results list */
async function queryResources() {
    const offset = (page.value - 1) * limit.value
    const body = `{"query":"${query.value}", "filter":"${filter.value}", "limit":"${limit.value}", "offset":"${offset}"}`

    try {
        const response = await $fetch<v2SearchResourcesResponse>('https://api.dev.aruna-storage.org/v2/search', {
            //const response = await $fetch<v2SearchResourcesResponse>('http://localhost:8080/v2/search', {
            method: "POST",
            body: body
        })

        hits.value = response.resources ? response.resources : []
        estimatedTotal.value = response.estimatedTotal ? Number(response.estimatedTotal) : 0

    } catch (error) {
        console.warn(error)
        hits.value = []
    }
}

onMounted(async () => await queryResources())
</script>

<template>
    <div class="container-xl text-start mt-4">
        <div class="row mt-2">
            <div class="col-3">
                <h2 class="text-primary">Search results</h2>
                <div class="text-secondary">
                    About {{ estimatedTotal }} results
                </div>
            </div>
            <div class="col-9 pe-4">
                <div class="input-group">
                    <label for="formFile" class="input-group-text">
                        <div class="col-auto d-flex">
                            <IconSearch class="icon" />

                        </div>
                    </label>
                    <input type="text" class="form-control form-control-lg" placeholder="Search Aruna objects"
                        v-model.lazy="query" @input="updateQuery" />
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
                    <h3 class="text-muted mb-3">Filters</h3>
                    <div class="subheader mb-2">Resource</div>

                    <div class="form-selectgroup mb-3">
                        <label class="form-selectgroup-item flex-fill">
                            <input v-model="typeFilter" type="radio" name="form-payment"
                                :value="v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED" class="form-selectgroup-input"
                                checked />
                            <div class="form-selectgroup-label d-flex align-items-center p-3">
                                <IconWorldSearch class="icon me-2" /> <strong>All</strong>
                            </div>
                        </label>
                        <label class="form-selectgroup-item flex-fill">
                            <input v-model="typeFilter" type="radio" name="form-payment"
                                :value="v2ResourceVariant.RESOURCE_VARIANT_PROJECT" class="form-selectgroup-input"
                                checked />
                            <div class="form-selectgroup-label d-flex align-items-center p-3">
                                <IconFolders class="icon me-2" /> <strong>Project</strong>
                            </div>
                        </label>
                        <label class="form-selectgroup-item flex-fill">
                            <input v-model="typeFilter" type="radio" name="form-payment"
                                :value="v2ResourceVariant.RESOURCE_VARIANT_COLLECTION" class="form-selectgroup-input"
                                checked />
                            <div class="form-selectgroup-label d-flex align-items-center p-3">
                                <IconFolder class="icon me-2" /> <strong>Collection</strong>
                            </div>
                        </label>
                        <label class="form-selectgroup-item flex-fill">
                            <input v-model="typeFilter" type="radio" name="form-payment"
                                :value="v2ResourceVariant.RESOURCE_VARIANT_DATASET" class="form-selectgroup-input"
                                checked />
                            <div class="form-selectgroup-label d-flex align-items-center p-3">
                                <IconFiles class="icon me-2" /> <strong>Dataset</strong>
                            </div>
                        </label>
                        <label class="form-selectgroup-item flex-fill">
                            <input v-model="typeFilter" type="radio" name="form-payment"
                                :value="v2ResourceVariant.RESOURCE_VARIANT_OBJECT" class="form-selectgroup-input"
                                checked />
                            <div class="form-selectgroup-label d-flex align-items-center p-3">
                                <IconFile class="icon me-2" /> <strong>Object</strong>
                            </div>
                        </label>
                    </div>

                    <div class="subheader mb-4">Filters</div>
                    <div class="input-group mb-3">
                        <input v-model.lazy="customFilter" @input="generateFilter()" type="text" class="form-control"
                            placeholder="Filter string" aria-label="Filter string" />
                    </div>

                    <div class="alert alert-success" role="alert">
                        <div class="alert-title">Filter arguments by value.</div>
                        <div class="text-muted mt-2">
                            E.g: <b>"size > 100"</b> , <b>"labels.key = akey"</b>
                        </div>
                        <div class="text-secondary mt-2 mb-2">
                            Current available parameters can be looked up in the
                            <NuxtLink
                                to="https://arunastorage.github.io/Documentation/latest/get_started/basic_usage/12_How-To-Search/"
                                target="_blank" rel="noreferrer">
                                documentation
                            </NuxtLink>.
                        </div>
                        <!-- 
                        <div class="text-secondary">
                            <b>size</b>
                            ,
                            <b>labels.key</b>
                            ,
                            <b>labels.value</b>
                            ,
                            <b>created_at</b>
                        </div>
                        -->
                    </div>
                </div>

                <!-- Display Search Results -->
                <SearchResults :key="hits" :resources="hits" />
            </div>
        </div>
    </div>
</template>