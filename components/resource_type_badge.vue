<script setup lang="ts">
import { v2ResourceVariant } from '~/composables/aruna_api_json';

const props = defineProps<{
    variant: v2ResourceVariant | undefined
}>()
</script>

<template>
    <span v-if="variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT" class="badge badge-outline text-blue">Project</span>
    <span v-else-if="variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION" class="badge badge-outline text-orange">Collection</span>
    <span v-else-if="variant === v2ResourceVariant.RESOURCE_VARIANT_DATASET" class="badge badge-outline text-cyan">Dataset</span>
    <span v-else-if="variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT" class="badge badge-outline text-blue">Object</span>
    <span v-else class="badge badge-outline text-blue">Unknown</span>
</template>