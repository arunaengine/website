<script setup lang="ts">
const props = defineProps<{
    license: string | undefined,
    meta: boolean
}>()
</script>

<template>
    <span v-if="meta" class="badge badge-outline text-blue">{{ license }}</span>
    <span v-else class="badge badge-outline text-yellow">{{ license }}</span>
</template>