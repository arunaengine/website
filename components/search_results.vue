<script setup lang="ts">
import type { v2GenericResource, v2SearchResourcesResponse } from '@/composables/aruna_api_json';

const props = defineProps<{
    resources: v2GenericResource[]
}>()
</script>

<template>
    <div class="col-9 ps-3">
        <div v-if="resources.length > 0">
            <div class="card m-1" v-for="hit in resources">
                <ResourceCard :resource=hit />
            </div>
        </div>
        <div v-else>
            <div class="d-flex">
                <h2 class="text-muted">"No results found"</h2>
            </div>
        </div>
    </div>
</template>