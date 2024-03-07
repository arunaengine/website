<script setup lang="ts">
import { IconArrowLeft, IconBuildingWarehouse, IconCheck, IconCross, IconLockOpen, IconPlus, IconUser, IconX } from '@tabler/icons-vue';
import type { v2Token } from '~/composables/aruna_api_json';

// Redirect to login if not logged in
definePageMeta({
  middleware: "check-access"
})

const router = useRouter()
const arunaUser = await fetchUser()

function getTokens(): v2Token[] {
  if (arunaUser?.attributes?.tokens) {
    return arunaUser?.attributes?.tokens
  }

  return []
}
</script>

<template>
  <div class="page-wrapper d-print-none">
    <div class="page-header">
      <div class="container-xl">
        <div class="row g-2">
          <div class="col">
            <div class="page-pretitle text-start">Overview</div>
            <h2 class="page-title">User</h2>
          </div>
          <div class="col-auto ms-auto d-print-none">
            <div class="btn-list">
              <a @click="router.back()" class="btn btn-ghost-secondary d-none d-sm-inline-block pe-0 ps-3">
                <IconArrowLeft class="icon" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- User account info -->
  <div class="container-xl mt-3">
    <div class="card p-5">
      <!-- <h3>Profile</h3> -->
      <div class="datagrid">
        <div class="datagrid-item">
          <div class="datagrid-title">ID</div>
          <div class="datagrid-content">{{ arunaUser?.id }}</div>
        </div>
        <div class="datagrid-item">
          <div class="datagrid-title">Display Name</div>
          <div class="datagrid-content">{{ arunaUser?.displayName }}</div>
        </div>
        <div class="datagrid-item">
          <div class="datagrid-title">E-Mail</div>
          <div class="datagrid-content">{{ arunaUser?.email ? arunaUser?.email : "No email provided" }}</div>
        </div>
        <div class="datagrid-item">
          <div class="datagrid-title">Is active?</div>
          <div class="datagrid-content">
            <IconCheck v-if="arunaUser?.active" class="icon text-green" />
            <IconX v-else class="icon text-red" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Token List -->
  <div class="container-xl mt-3">
    <div class="row mb-4">
      <div class="col">
        <h2 class="page-title">Tokens</h2>
      </div>
    </div>
  </div>
  <div class="container-xl mt-2 text-start">
    <div class="card">
      <div class="table-responsive">
        <table class="table table-vcenter card-table accordion" id="tokenTable">
          <thead>
            <tr>
              <th>Id</th>
              <th>Name</th>
              <th>Last used</th>
              <th class="w-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="getTokens().length > 0" v-for="token in getTokens()">
              <td>{{ token.id }}</td>
              <td>{{ token.name }}</td>
              <td>Not yet implemented</td>
              <td>
                Details & Delete
              </td>
            </tr>
            <tr v-else>
              <td colspan="4" class="text-center">
                Looks like you currently have no active tokens!
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card-footer p-0">
        <div class="d-flex">
          <button @click="" class="btn btn-primary ms-auto m-1">
            <IconPlus class="icon" /> Create Token
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 
  <div class="page-wrapper d-print-none">
    <div class="page-header">
      <div class="container-xl">
        <div class="row g-2">
          <div class="col">
            <div class="page-pretitle text-start">Overview</div>
            <h2 class="page-title">User</h2>
          </div>
          <div class="col-auto ms-auto d-print-none">
            <div class="btn-list">
              <a @click="router.back()" class="btn btn-ghost-secondary d-none d-sm-inline-block pe-0 ps-3">
                <IconArrowLeft class="icon" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="container-xl">
      <div class="card">
        <div class="card-header">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
            <li class="nav-item active show">
              <a href="#tabs-profile" class="nav-link" data-bs-toggle="tab">
                <IconUser class="icon" /> Profile
              </a>
            </li>
            <li class="nav-item">
              <a href="#tabs-tokens" class="nav-link" data-bs-toggle="tab">
                <IconLockOpen class="icon" /> Tokens
              </a>
            </li>
            <li class="nav-item">
              <a href="#tabs-proxies" class="nav-link" data-bs-toggle="tab">
                <IconBuildingWarehouse class="icon" /> DataProxies
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <div class="tab-pane active show" id="tabs-profile">
              <h4>Profile</h4>
              <div class="datagrid">
                <div class="datagrid-item">
                  <div class="datagrid-title">ID</div>
                  <div class="datagrid-content">{{ arunaUser?.id }}</div>
                </div>
                <div class="datagrid-item">
                  <div class="datagrid-title">Display Name</div>
                  <div class="datagrid-content">{{ arunaUser?.displayName }}</div>
                </div>
                <div class="datagrid-item">
                  <div class="datagrid-title">E-Mail</div>
                  <div class="datagrid-content">{{ arunaUser?.email ? arunaUser?.email : "No email provided" }}</div>
                </div>
                <div class="datagrid-item">
                  <div class="datagrid-title">Is active?</div>
                  <div class="datagrid-content">
                    <IconCheck v-if="arunaUser?.active" class="icon text-green" />
                    <IconX v-else class="icon text-red" />
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-pane" id="tabs-tokens">
              <h4>Tokens</h4>
              <div>A list of your current tokens.</div>
            </div>
            <div class="tab-pane" id="tabs-proxies">
              <h4>Data Proxies</h4>
              <div>A list of the DataProxies you are registered at.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
   -->
</template>