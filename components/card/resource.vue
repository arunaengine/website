<script setup lang="ts">

import { type v2KeyValue, v2KeyValueVariant, type v2GenericResource, v2ResourceVariant, v2DataClass } from '~/composables/aruna_api_json';

const props = defineProps<{
    resource: v2GenericResource
}>()
const entry = toSearchResult(props.resource)

function filterKeyValues(keyValues: v2KeyValue[] | undefined, variant: v2KeyValueVariant | undefined): v2KeyValue[] {
    //TODO
    return []
}
</script>

<template>
    <div class="card-body d-flex container flex-column">
        <div v-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT" class="ribbon bg-blue">Project</div>
        <div v-else-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION" class="ribbon bg-orange">
            Collection</div>
        <div v-else-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_DATASET" class="ribbon bg-cyan">Dataset</div>
        <div v-else-if="entry?.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT" class="ribbon bg-green">Object</div>
        <div v-else class="ribbon bg-pink">Unknown</div>

        <div class="row">
            <div class="col-4">
                <div>
                    <NuxtLink :to="`/objects/${entry?.id}`" class="text-primary">
                        <h3>{{ entry?.name }}</h3>
                    </NuxtLink>

                    <NuxtLink :to="`/objects/${entry?.id}`" class="subheader">
                        <h4>{{ entry?.id }}</h4>
                    </NuxtLink>
                </div>

                <!-- Object Status -->
                <div v-if="entry?.data_class === v2DataClass.DATA_CLASS_PUBLIC" class="status status-green m-1">Public</div>
                <div v-else-if="entry?.data_class === v2DataClass.DATA_CLASS_PRIVATE" class="status status-orange m-1">
                    Private</div>
                <div v-else-if="entry?.data_class === v2DataClass.DATA_CLASS_WORKSPACE" class="status status-cyan m-1">
                    Workspace</div>
                <div v-else-if="entry?.data_class === v2DataClass.DATA_CLASS_CONFIDENTIAL" class="status status-green m-1">
                    Confidential</div>
                <div v-else class="status status-red m-1">Unknown</div>

                <!-- Stats -->
                <span class="status status-yellow m-1">Count: {{ entry?.stats.count }}</span>
                <span v-if="entry?.stats.size" class="status status-cyan m-1">{{ formatBytes(+entry?.stats.size) }}</span>
            </div>

            <!-- Labels -->
            <div class="col border-start me-4 container">
                <div class="border-bottom pb-3 mb-2">
                    <div v-for="label in entry?.key_values" class="d-inline-flex tag">
                        <div class="key text-secondary">{{ label.key }}</div>
                        <div v-if="label.value" class="value">{{ label.value }}</div>
                    </div>
                </div>

                <!-- Description -->
                <div class="row">
                    <h4 class="subheader mb-0">Description</h4>
                    <p class="text-secondary mb-0">{{ entry?.description }}</p>
                </div>
        </div>
    </div>
</div></template>