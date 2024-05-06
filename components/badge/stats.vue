<script setup lang="ts">
const props = defineProps<{
  count: string | undefined,
  objectSize: string | undefined
}>()
</script>
<template>
  <span
    class="m-1 inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-md text-xs font-bold border border-yellow-500 text-yellow-500">
    Count <!--<IconHash class="flex-shrink-0 size-3"/>--> {{ props.count ? props.count : "N/A" }}
  </span>
  <span
    class="m-1 inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-md text-xs font-bold border border-cyan-500 text-cyan-500">
    {{ objectSize ? formatBytes(+objectSize) : "N/A Bytes" }}
  </span>
</template>