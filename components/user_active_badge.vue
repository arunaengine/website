<script setup lang="ts">
const props = defineProps<{
    active: boolean
}>()
</script>

<template>
    <span v-if="props.active" class="status status-green">
        <span class="status-dot"></span>
        active
    </span>
    <span v-else class="status status-yellow">
        <span class="status-dot"></span>
        inactive
    </span>
</template>