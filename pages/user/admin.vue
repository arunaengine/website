<script setup lang="ts">
import { IconMinus, IconPlus } from '@tabler/icons-vue';
import type { v2User } from '~/composables/aruna_api_json';

const users: Ref<v2User[] | undefined> = ref(await fetchUsers())
async function fillUsers() {
    users.value = await fetchUsers()
}

async function deactivate(userId: string) {
    await deactivateUser(userId)
    await fillUsers()
}

async function activate(userId: string) {
    await activateUser(userId)
    await fillUsers()
}
</script>

<template>
    <div class="page-header d-print-none my-3">
        <div class="container-xl">
            <div class="row g-2 align-items-center">
                <div class="col">
                    <div class="page-pretitle text-start">Global Permissions</div>
                    <h2 class="page-title">Users</h2>
                </div>
            </div>
        </div>
    </div>

    <div class="container-xl mt-2 text-start">
        <div class="card">
            <div class="table-responsive">
                <table class="table table-vcenter card-table" id="adminTable">
                    <thead>
                        <tr>
                            <th>Id</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th class="w-1">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr :key="users" v-for="user in users">
                            <td>{{ user.id }}</td>
                            <td>{{ user.displayName }}</td>
                            <td>{{ user.email ? user.email : "No email provided" }}</td>
                            <td>
                                <UserActiveBadge v-if="user.active != undefined" :active="user.active" />
                                <UserRoleBadge :user="user" />
                            </td>
                            <td>
                                <button v-if="user.active && user.id" class="btn btn-danger btn-icon btn-sm"
                                    @click="deactivate(user.id)">
                                    <IconMinus class="icon" />
                                </button>
                                <button v-else-if="!user.active && user.id" class="btn btn-success btn-icon btn-sm"
                                    @click="activate(user.id)">
                                    <IconPlus class="icon" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>