<script setup lang="ts">
import { v2PermissionLevel } from '~/composables/aruna_api_json';

const props = defineProps<{
    permission: v2PermissionLevel | undefined
}>()
</script>

<template>
    <span v-if="permission === v2PermissionLevel.PERMISSION_LEVEL_READ" class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-green-600 text-green-600 dark:text-green-500">Read</span>
    <span v-else-if="permission === v2PermissionLevel.PERMISSION_LEVEL_APPEND" class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-yellow-600 text-yellow-600 dark:text-yellow-500">Append</span>
    <span v-else-if="permission === v2PermissionLevel.PERMISSION_LEVEL_WRITE" class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-orange-600 text-orange-600 dark:text-orange-500">Write</span>
    <span v-else-if="permission === v2PermissionLevel.PERMISSION_LEVEL_ADMIN" class="m-1 inline-flex items-center gap-x-1.5 py-1 px-1.5 rounded-md text-md font-medium border border-red-600 text-red-600 dark:text-red-500">Admin</span>
    <span v-else class="badge badge-outline text-gray">None</span>
</template>