<script setup lang="ts">
import { v2PermissionLevel } from '~/composables/aruna_api_json';

const props = defineProps<{
    permission: v2PermissionLevel | undefined
}>()
</script>

<template>
    <span v-if="permission === v2PermissionLevel.PERMISSION_LEVEL_READ" class="badge badge-outline text-green">Read</span>
    <span v-else-if="permission === v2PermissionLevel.PERMISSION_LEVEL_APPEND" class="badge badge-outline text-yellow">Append</span>
    <span v-else-if="permission === v2PermissionLevel.PERMISSION_LEVEL_WRITE" class="badge badge-outline text-orange">Write</span>
    <span v-else-if="permission === v2PermissionLevel.PERMISSION_LEVEL_ADMIN" class="badge badge-outline text-red">Admin</span>
    <span v-else class="badge badge-outline text-gray">None</span>
</template>