<script setup lang="ts">
import { v2DataClass } from '~/composables/aruna_api_json';
const props = defineProps<{
    dataClass: v2DataClass | undefined
}>()
</script>

<template>
    <span v-if="dataClass === v2DataClass.DATA_CLASS_PUBLIC" class="badge badge-outline text-green">Public</span>
    <span v-else-if="dataClass === v2DataClass.DATA_CLASS_PRIVATE" class="badge badge-outline text-orange">Private</span>
    <span v-else-if="dataClass === v2DataClass.DATA_CLASS_WORKSPACE" class="badge badge-outline text-cyan">Workspace</span>
    <span v-else-if="dataClass === v2DataClass.DATA_CLASS_CONFIDENTIAL" class="badge badge-outline text-red">Collection</span>
    <span v-else class="badge badge-outline text-blue">Unknown DataClass</span>
</template>