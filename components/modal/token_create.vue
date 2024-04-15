<script lang="ts" setup>
import {v2PermissionLevel, v2ResourceVariant, type v2Permission} from "~/composables/aruna_api_json";
import {ULID_REGEX} from "~/composables/constants";
import {IconExclamationCircle} from "@tabler/icons-vue";

const props = defineProps<{
  modalId: string
}>()

enum tokenScopes {
  Personal = 'Personal', //new SelectOption('Personal', 'Personal')
  Project = 'Project',
  Collection = 'Collection',
  Dataset = 'Dataset',
  Object = 'Object'
}

enum tokenPermissions {
  PERMISSION_LEVEL_NONE = 'PERMISSION_LEVEL_NONE',
  PERMISSION_LEVEL_READ = 'PERMISSION_LEVEL_READ',
  PERMISSION_LEVEL_APPEND = 'PERMISSION_LEVEL_APPEND',
  PERMISSION_LEVEL_WRITE = 'PERMISSION_LEVEL_WRITE',
  PERMISSION_LEVEL_ADMIN = 'PERMISSION_LEVEL_ADMIN',
}

function displayPermissionLevel(level: v2PermissionLevel): string {
  switch (level) {
    case v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED: {
      return 'Unspecified'
    }
    case v2PermissionLevel.PERMISSION_LEVEL_NONE: {
      return 'None'
    }
    case v2PermissionLevel.PERMISSION_LEVEL_READ: {
      return 'Read'
    }
    case v2PermissionLevel.PERMISSION_LEVEL_APPEND: {
      return 'Append'
    }
    case v2PermissionLevel.PERMISSION_LEVEL_WRITE: {
      return 'Write'
    }
    case v2PermissionLevel.PERMISSION_LEVEL_ADMIN: {
      return 'Admin'
    }
  }
}

const tokenName = ref('')
const tokenScope = ref(tokenScopes.Personal)
const tokenPermission = ref(v2PermissionLevel.PERMISSION_LEVEL_NONE)
const tokenResource = ref('')
const tokenResourceErr: Ref<string | undefined> = ref(undefined)
const tokenSecret: Ref<string | undefined> = ref(undefined)
const validationStatus = ref(false)
const tokenCreationErr: Ref<string | undefined> = ref(undefined)

// Empty fields if switched to Personal scope
watch(tokenScope, () => {
  if (tokenScope.value === tokenScopes.Personal) {
    tokenPermission.value = v2PermissionLevel.PERMISSION_LEVEL_NONE
    tokenResource.value = ''
  }

  validate()
})
watch(tokenName, () => validate())
watch(tokenPermission, () => validate())
watch(tokenResource, () => validate())


// Validate input
function validate() {
  if (tokenScope.value === tokenScopes.Personal) {
    validationStatus.value = true
  } else {
    if (tokenPermission.value === v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED) {
      validationStatus.value = false
      //ToDo: Set validation state and return
      return
    }

    if (tokenResource.value.length <= 0) {
      validationStatus.value = false
      tokenResourceErr.value = 'Please enter a resource id'
      return
    } else if (tokenResource.value.match(ULID_REGEX) === null) {
      validationStatus.value = false
      tokenResourceErr.value = 'Resource id is not a valid ULID'
      return
    } else {
      tokenResourceErr.value = undefined
    }

    validationStatus.value = true
  }
}

// Try to send request to server; display error on failure
async function sendRequest() {
  const perm = tokenScope.value === tokenScopes.Personal ? undefined : {
    projectId: tokenScope.value === tokenScopes.Project ? tokenResource.value : undefined,
    collectionId: tokenScope.value === tokenScopes.Collection ? tokenResource.value : undefined,
    datasetId: tokenScope.value === tokenScopes.Dataset ? tokenResource.value : undefined,
    objectId: tokenScope.value === tokenScopes.Object ? tokenResource.value : undefined,
    permissionLevel: tokenPermission.value
  } as v2Permission

  await createUserToken(tokenName.value, perm, undefined)
      .then(response => {
        if (response?.tokenSecret) {
          tokenCreationErr.value = undefined
          validationStatus.value = false
          tokenSecret.value = response.tokenSecret
        }
      }).catch(error => {
        tokenCreationErr.value = 'Token creation failed. Please try again later.'
      })
}

function reset() {
  tokenName.value = ''
  tokenScope.value = tokenScopes.Personal
  tokenPermission.value = v2PermissionLevel.PERMISSION_LEVEL_NONE
  tokenResource.value = ''
  tokenResourceErr.value = undefined
  tokenSecret.value = undefined
  validationStatus.value = false
  tokenCreationErr.value = undefined
}
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto [--overlay-backdrop:static]"
       data-hs-overlay-keyboard="false">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div
          class="flex flex-col bg-white border shadow-sm  pointer-events-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 border-b dark:border-gray-700">
          <h3 class="font-bold text-gray-800 dark:text-white">
            Create a new Token
          </h3>
          <button type="button" @click="reset"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  :data-hs-overlay="`#${props.modalId}`">
            <span class="sr-only">Close</span>
            <svg class="flex-shrink-0 size-4" fill="none" height="24" stroke="currentColor" stroke-linecap="round"
                 stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"
                 xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
<!--

          <p class="my-2 text-gray-800 dark:text-gray-400 text-center">
            Here you can create a new token.
          </p>
-->

          <!-- Floating Input Token Name -->
          <div class="relative">
            <input v-model="tokenName" id="hs-floating-input-name" class="my-2 peer p-4 block w-full border-gray-200 rounded-lg text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2" placeholder="A name for the token" type="text" :disabled="tokenSecret">
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="hs-floating-input-name">Token Name</label>
          </div>
          <!-- End Floating Input Token Name -->

          <!-- Floating Select -->
          <div class="relative">
            <select v-model="tokenScope" :disabled="tokenSecret"
                    class="my-2 peer p-4 pe-9 block w-full border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                    focus:pt-6
                    focus:pb-2
                    [&:not(:placeholder-shown)]:pt-6
                    [&:not(:placeholder-shown)]:pb-2
                    autofill:pt-6
                    autofill:pb-2">
              <!-- 
              <option v-for="(option, index) in scopeOptions" :value="option.value" v-bind:selected="index === 0">
                {{ option.text }}
              </option> 
              -->
              <option v-for="(scope, value, index) in tokenScopes" :value="scope" v-bind:selected="index === 0">
                {{ value }}
              </option>
            </select>
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500">Permission Scope</label>
          </div>
          <!-- End Floating Select -->

          <!-- Floating Select -->
          <div :class="{ 'hidden': tokenScope === tokenScopes.Personal }" class="relative">
            <select v-model="tokenPermission" :disabled="tokenSecret"
                    class="my-2 peer p-4 pe-9 block w-full border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                    focus:pt-6
                    focus:pb-2
                    [&:not(:placeholder-shown)]:pt-6
                    [&:not(:placeholder-shown)]:pb-2
                    autofill:pt-6
                    autofill:pb-2">
              <option v-for="(key, val) in tokenPermissions" :value="val"
                      v-bind:selected="key === tokenPermissions.PERMISSION_LEVEL_NONE">
                {{ displayPermissionLevel(val) }}
              </option>
            </select>
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500">Permission Level</label>
          </div>
          <!-- End Floating Select -->

          <!-- Floating Input Token Name -->
          <div :class="{ 'hidden': tokenScope === tokenScopes.Personal }" class="relative">
            <input v-model="tokenResource" :disabled="tokenSecret"
                   id="hs-floating-input-resource"
                   class="my-2 peer p-4 block w-full border-gray-200 rounded-lg text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2" placeholder="A resource id" type="text">
            <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="hs-floating-input-resource">Resource ID</label>
            <div :class="{ 'hidden': typeof tokenResourceErr === 'undefined'}"
                 class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
              <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
            </div>
          </div>
          <p :class="{ 'hidden': typeof tokenResourceErr === 'undefined'}" class="text-sm text-red-600 mt-2"
             id="hs-validation-name-error-helper">{{ tokenResourceErr }}
          </p>
          <!-- End Floating Input Token Name -->

        </div>

        <!-- Token Secret -->
        <div v-if="tokenSecret" class="flex flex-col text-center m-4 bg-white border shadow-sm rounded-xl p-4 md:p-5 dark:bg-neutral-900 dark:border-neutral-700 dark:shadow-neutral-700/70">
          <h3 class="text-lg font-bold text-gray-800 dark:text-white">
            Token Secret
          </h3>
          <p class="mt-1 text-xs font-medium uppercase text-orange-500 dark:text-neutral-500">
            This token secret can not be regenerated.
          </p>
          <p class="mt-1 text-xs font-medium uppercase text-orange-500 dark:text-neutral-500">
            Store it in a secure location before you close this window.
          </p>
          <hr class="my-4" />
          <p class="mt-2 text-wrap break-words text-gray-800 dark:text-neutral-400">
            {{ tokenSecret }}
          </p>
        </div>
        <!-- End Token Secret -->
        <div v-if="tokenCreationErr" class="p-4 overflow-y-auto text-red-500">
          {{ tokenCreationErr }}
        </div>

        <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t dark:border-gray-700">
          <button type="button" @click="reset"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  :data-hs-overlay="`#${props.modalId}`">
            Close
          </button>
          <button v-bind:disabled="!validationStatus" :class="{ 'disabled': !validationStatus }"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  @click="sendRequest()" type="button">
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>