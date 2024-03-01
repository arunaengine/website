<script setup lang="ts">
import { modelsv2Status } from '~/composables/aruna_api_json';

const props = defineProps<{
    status: modelsv2Status | undefined
}>()
</script>

<template>
    <span v-if="status === modelsv2Status.STATUS_AVAILABLE" class="badge badge-outline text-green">Available</span>
    <span v-else-if="status === modelsv2Status.STATUS_UNAVAILABLE" class="badge badge-outline text-red">Unavailable</span>
    <span v-else class="badge badge-outline text-blue">Workspace</span>
</template>