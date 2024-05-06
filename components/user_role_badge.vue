<script setup lang="ts">
import { v2PermissionLevel, type v2User } from '~/composables/aruna_api_json';

const props = defineProps<{
    user: v2User
}>()

function isAdmin(): boolean {
    if (props.user.attributes?.globalAdmin) {
        return props.user.attributes.globalAdmin
    }
    return false
}

function isProjectAdmin() {
    if (props.user.attributes?.personalPermissions) {
        props.user.attributes.personalPermissions.forEach(perm => {
            if (perm.projectId && perm.permissionLevel === v2PermissionLevel.PERMISSION_LEVEL_ADMIN) {
                return true
            }
        })
    }
    return false
}
</script>

<template>
    <span v-if="isAdmin()" class="status status-red">
        <span class="status-dot"></span>
        admin
    </span>
    <span v-else-if="isProjectAdmin()" class="status status-yellow">
        <span class="status-dot"></span>
        inactive
    </span>
    <span v-else class="status status-blue">
        <span class="status-dot"></span>
        user
    </span>
</template>