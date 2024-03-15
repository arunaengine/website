<script setup lang="ts">
const props = defineProps<{
    license: string | undefined,
    meta: boolean
}>()
</script>

<template>
    <span v-if="meta" class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-blue-600 text-blue-600 dark:text-blue-500">{{ license }}</span>
    <span v-else class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-yellow-600 text-yellow-600 dark:text-yellow-500">{{ license }}</span>
</template>