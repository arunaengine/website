<script setup lang="ts">
import { IconArrowLeft, IconBuildingWarehouse, IconCheck, IconCross, IconLockOpen, IconPlus, IconPokeball, IconUser, IconUserScan, IconX } from '@tabler/icons-vue';
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

  <div class="flex flex-wrap justify-between container mx-auto mt-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Overview User
    </h1>
    <button @click="router.back()"
      class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon" />
    </button>
  </div>

  <div class="md:container sm:mx-1 md:mx-auto mt-4 p-4 border rounded-lg">
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-2" aria-label="Tabs" role="tablist">
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-blue-600 hs-tab-active:text-blue-600 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 active"
          id="tabs-with-icons-item-1" data-hs-tab="#tabs-with-icons-1" aria-controls="tabs-with-icons-1" role="tab">
          <IconUserScan class="flex-shrink-0 size-4" />
          Profile
        </button>
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-blue-600 hs-tab-active:text-blue-600 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500"
          id="tabs-with-icons-item-2" data-hs-tab="#tabs-with-icons-2" aria-controls="tabs-with-icons-2" role="tab">
          <IconPokeball class="flex-shrink-0 size-4" />
          Tokens
        </button>
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-blue-600 hs-tab-active:text-blue-600 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500"
          id="tabs-with-icons-item-3" data-hs-tab="#tabs-with-icons-3" aria-controls="tabs-with-icons-3" role="tab">
          <IconBuildingWarehouse class="flex-shrink-0 size-4" />
          Data Proxies
        </button>
      </nav>
    </div>

    <div class="mt-3">
      <div id="tabs-with-icons-1" role="tabpanel" aria-labelledby="tabs-with-icons-item-1">
        <p class="text-gray-500 dark:text-gray-400">
          This is the <em class="font-semibold text-gray-800 dark:text-gray-200">first</em> item's tab body.
        </p>
      </div>
      <div id="tabs-with-icons-2" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-2">
        <p class="text-gray-500 dark:text-gray-400">
          This is the <em class="font-semibold text-gray-800 dark:text-gray-200">second</em> item's tab body.
        </p>
      </div>
      <div id="tabs-with-icons-3" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-3">
        <p class="text-gray-500 dark:text-gray-400">
          This is the <em class="font-semibold text-gray-800 dark:text-gray-200">third</em> item's tab body.
        </p>
      </div>
    </div>
  </div>



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