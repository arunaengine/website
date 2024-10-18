<script setup lang="ts">
import {
  IconBuildingWarehouse,
  IconCheck,
  IconDiscountCheck,
  IconLoader,
  IconPokeball,
  IconTrash,
  IconUserScan,
  IconX
} from '@tabler/icons-vue'
import type {v2Endpoint, v2Token, v2User} from '~/composables/aruna_api_json'
import {storagemodelsv2ComponentStatus} from "~/composables/aruna_api_json";
import {deleteUserToken} from "~/composables/api_wrapper";
import EventBus from "~/composables/EventBus";
import {useToast} from "~/components/ui/toast";
import CredentialsDialog from "~/components/custom-ui/dialog/CredentialsDialog.vue";
import TokenDialog from "~/components/custom-ui/dialog/TokenDialog.vue";
import {DateFormatter} from "@internationalized/date";

// Toast for notifications
const {toast} = useToast()

// DateFormatter for token expiry dates
const df = new DateFormatter((navigator && navigator.language) || "de-DE", {
  dateStyle: 'long',
})

// Constants
const arunaUser: Ref<v2User | undefined> = inject('userRef', ref(undefined))
const endpoints: v2Endpoint[] | undefined = await fetchEndpoints()

watch(arunaUser, () => {
  console.log("User got updated")
  // Refresh lists
  console.log(arunaUser.value?.attributes?.tokens)
})

const get_user = () => {
  if (arunaUser.value === undefined || typeof arunaUser.value === "string") {
    return undefined
  }
  return arunaUser.value
}

function is_active(): boolean {
  if (arunaUser.value === undefined || typeof arunaUser.value === "string") {
    return false
  } else if (arunaUser.value.active) {
    return arunaUser.value.active
  }
  return false
}

function getTokens(): v2Token[] {
  if (arunaUser.value === undefined || typeof arunaUser.value === "string") {
    return []
  } else {
    if (arunaUser.value.attributes?.tokens) {
      return arunaUser.value.attributes?.tokens
    }
  }
  return []
}

async function deleteToken(tokenId: string) {
  await deleteUserToken(tokenId)
  EventBus.emit("updateUser")
}

function hasEndpoint(endpointId: string | undefined): boolean {
  if (arunaUser.value === undefined || typeof arunaUser.value === "string") {
    return false
  } else {
    let found = false
    if (arunaUser.value?.attributes?.trustedEndpoints) {
      for (const trustedEndpoint of arunaUser.value.attributes.trustedEndpoints) {
        if (trustedEndpoint === endpointId) {
          found = true
          break
        }
      }
    }
    return found
  }
}

/* ----- CREDENTIALS DIALOG ----- */
const enum Dialogs {
  TokenDialog,
  CredentialsDialog
}

type EndpointCredentials = {
  endpointId: string,
  endpointName?: string,
  endpointHost: string,
  accessKeyId: string,
  accessSecret: string,
}

const credentials: Ref<EndpointCredentials | undefined> = ref(undefined)
const loading: Ref<string | undefined> = ref(undefined)

const credentialsDialogOpen = ref(false)
const tokenDialogOpen = ref(false)

function setVisibility(dialog: Dialogs, visible: boolean): void {
  switch (dialog) {
    case Dialogs.TokenDialog:
      tokenDialogOpen.value = visible
      break
    case Dialogs.CredentialsDialog:
      credentialsDialogOpen.value = visible
      break
    default:
      console.log(`Dialog ${dialog} does not exist here.`)
  }
}

function clear() {
  credentials.value = undefined
  credentialsDialogOpen.value = false
}

async function createS3Credentials(endpoint: v2Endpoint) {
  // Indicate async loading in progress (disable buttons)
  loading.value = `${endpoint.id}_create`
  // Create S3 credentials
  await createUserS3Credentials(endpoint.id)
      .then(response => {
        loading.value = undefined // Re-activate buttons
        if (response) {
          credentials.value = {
            endpointId: endpoint.id,
            endpointName: endpoint.name,
            endpointHost: response.s3EndpointUrl,
            accessKeyId: response.s3AccessKey,
            accessSecret: response.s3SecretKey
          } as EndpointCredentials
          setVisibility(Dialogs.CredentialsDialog, true)
        } else {
          // Empty remaining credentials and close if open
          credentials.value = undefined
          setVisibility(Dialogs.CredentialsDialog, false)

          // Notify with error
          toast({
            title: 'Error',
            description: 'Received empty response. If this problem persists please contact an administrator.',
            variant: 'destructive',
            duration: 10000,
          })
        }

        EventBus.emit('updateUser')
      }).catch(error => {
        loading.value = undefined // Re-activate buttons
        // Empty remaining credentials
        credentials.value = undefined

        // Notify with error
        toast({
          title: 'Error',
          //description: 'Something went wrong. If this problem persists please contact an administrator.',
          description: error.message,
          variant: 'destructive',
          duration: 10000,
        })
      })
}

async function getS3Credentials(endpoint: v2Endpoint) {
// Indicate async loading in progress (disable buttons)
  loading.value = `${endpoint.id}_create`
  // Fetch existing S3 credentials
  return await getUserS3Credentials(endpoint.id)
      .then(response => {
        loading.value = undefined // Re-activate buttons
        if (response) {
          credentials.value = {
            endpointId: endpoint.id,
            endpointName: endpoint.name,
            endpointHost: response.s3EndpointUrl,
            accessKeyId: response.s3AccessKey,
            accessSecret: response.s3SecretKey
          } as EndpointCredentials
          setVisibility(Dialogs.CredentialsDialog, true)
        } else {
          // Empty remaining credentials and close if open
          credentials.value = undefined
          setVisibility(Dialogs.CredentialsDialog, false)

          // Notify with error
          toast({
            title: 'Error',
            description: 'Received empty response. If this problem persists please contact an administrator.',
            variant: 'destructive',
            duration: 10000,
          })
        }
      }).catch(error => {
        loading.value = undefined // Re-activate buttons
        // Empty remaining credentials
        credentials.value = undefined

        // Notify with error
        toast({
          title: 'Error',
          //description: 'Something went wrong. If this problem persists please contact an administrator.',
          description: error.message,
          variant: 'destructive',
          duration: 10000,
        })
      })
}

/* ----- END CREDENTIALS DIALOG ----- */
</script>

<template>
  <NavigationTop/>

  <CredentialsDialog :initial-open="credentialsDialogOpen"
                     :with-button="false"
                     :host-id="credentials?.endpointId || ''"
                     :host-name="credentials?.endpointName || ''"
                     :host-url="credentials?.endpointHost || ''"
                     :access-key-id="credentials?.accessKeyId || ''"
                     :access-secret="credentials?.accessSecret || ''"
                     @update:open="clear"/>

  <TokenDialog :initial-open="tokenDialogOpen"
               :with-button="false"
               @update:open="setVisibility(Dialogs.TokenDialog, false)"/>

  <div class="min-h-[calc(100vh-110px)]">
    <div class="md:container sm:mx-1 md:mx-auto mt-[10vh] p-4 border-2 border-gray-400 rounded-md bg-[#080d1f]">
      <div class="border-b border-gray-700">
        <nav class="flex space-x-6" aria-label="Tabs" role="tablist">
          <button type="button"
                  class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-700 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-lg whitespace-nowrap text-gray-400 hover:text-arunaPrimary disabled:opacity-50 disabled:pointer-events-none :focus:outline-none focus:ring-2 focus:ring-aruna-700 active"
                  id="tabs-with-icons-item-1"
                  data-hs-tab="#tabs-with-icons-1"
                  aria-controls="tabs-with-icons-1"
                  role="tab">
            <IconUserScan class="flex-shrink-0"/>
            Profile
          </button>
          <button type="button"
                  class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-700 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-lg whitespace-nowrap text-gray-400 hover:text-arunaPrimary disabled:opacity-50 disabled:pointer-events-none :focus:outline-none focus:ring-2 focus:ring-aruna-700"
                  id="tabs-with-icons-item-2"
                  data-hs-tab="#tabs-with-icons-2"
                  aria-controls="tabs-with-icons-2"
                  role="tab">
            <IconPokeball class="flex-shrink-0 size-4"/>
            Tokens
          </button>
          <button type="button"
                  class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-700 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-lg whitespace-nowrap text-gray-400 hover:text-arunaPrimary disabled:opacity-50 disabled:pointer-events-none :focus:outline-none focus:ring-2 focus:ring-aruna-700"
                  id="tabs-with-icons-item-3"
                  data-hs-tab="#tabs-with-icons-3"
                  aria-controls="tabs-with-icons-3"
                  role="tab">
            <IconBuildingWarehouse class="flex-shrink-0 size-4"/>
            Data Proxies
          </button>
        </nav>
      </div>

      <div class="mt-3">
        <div id="tabs-with-icons-1" role="tabpanel" aria-labelledby="tabs-with-icons-item-1">
          <div v-if="!is_active()"
               class="my-6 text-center bg-yellow-800/10 border border-yellow-900 text-yellow-500 text-sm rounded-lg p-4"
               role="alert">
            <span class="font-bold">
              Info:</span> Your account is currently not active. We will activate your account as soon as possible.
          </div>

          <div class="flex flex-col gap-y-4 lg:flex-row justify-between">
            <Card class="basis-1/5">
              <CardHeader class="text-center">
                <CardTitle class="text-xl text-gray-200">User Id</CardTitle>
                <CardDescription class="text-lg">{{ get_user()?.id || '-' }}</CardDescription>
              </CardHeader>
            </Card>

            <Card class="basis-1/5">
              <CardHeader class="text-center">
                <CardTitle class="text-xl text-gray-200">Display Name</CardTitle>
                <CardDescription class="text-lg">{{ get_user()?.displayName || '-' }}</CardDescription>
              </CardHeader>
            </Card>

            <Card class="basis-1/5">
              <CardHeader class="text-center">
                <CardTitle class="text-xl text-gray-200">Email</CardTitle>
                <CardDescription class="text-lg">{{ get_user()?.email ? get_user()?.email : "No email provided" }}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card class="basis-1/5">
              <CardHeader class="text-center">
                <CardTitle class="text-xl">Active</CardTitle>
                <CardDescription class="flex text-lg items-center justify-center">
                  <IconCheck v-if="is_active()" class="flex-shrink-0 size-8 text-green-600"/>
                  <IconX v-else class="flex-shrink-0 text-red-600"/>
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        <div id="tabs-with-icons-2" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-2">
          <div class="flex flex-col">
            <div class="-m-1.5 overflow-x-auto">
              <div class="p-1.5 min-w-full inline-block align-middle">
                <div class="overflow-hidden">
                  <table class="min-w-full divide-y divide-gray-500">
                    <thead>
                    <tr>
                      <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-400 uppercase">ID</th>
                      <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-400 uppercase">Name</th>
                      <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-400 uppercase">Last
                        Used
                      </th>
                      <th scope="col" class="px-6 py-3 text-start text-md font-medium text-gray-400 uppercase">Expiry
                        date
                      </th>
                      <th scope="col" class="px-6 py-3 text-center text-md font-medium text-gray-400 uppercase">Actions
                      </th>
                    </tr>
                    </thead>

                    <tbody v-if="getTokens().length > 0" class="divide-y divide-gray-500">
                    <tr v-for="token in getTokens()" class="hover:bg-gray-700">
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-300">
                        {{ token.id }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {{ token.name }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        Not yet implemented
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {{ token.expiresAt ? df.format(new Date(token.expiresAt)) : 'Expiry date is undefined' }}
                      </td>

                      <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <button v-if="token.id" type="button"
                                @click="deleteToken(token.id)"
                                class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:text-red-700 hover:border hover:border-red-700 focus:z-10 focus:outline-none focus:ring-2 focus:ring-aruna-700">
                          <IconTrash/>
                        </button>
                      </td>
                    </tr>
                    </tbody>
                    <tbody v-else>
                    <tr class="hover:bg-gray-700">
                      <td colspan="5" class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-200">
                        <strong>Looks like you currently have no active tokens!</strong>
                      </td>
                    </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div class="flex flex-row justify-end">
            <Button @click="setVisibility(Dialogs.TokenDialog, true)"
                    class="mt-2 bg-aruna-800 hover:bg-aruna-700 text-white text-md rounded-sm">
              Create Token
            </Button>
          </div>
        </div>

        <div id="tabs-with-icons-3" class="hidden" role="tabpanel" aria-labelledby="tabs-with-icons-item-3">
          <div class="flex flex-auto flex-wrap gap-x-4 gap-y-4 text-gray-600">
            <div v-for="endpoint in endpoints"
                 class="flex flex-col space-y-1 bg-slate-900 border border-gray-700 shadow-sm rounded-xl p-4 md:p-5 text-gray-300">
              <div class="flex flex-row font-bold items-center justify-between text-aruna-700 text-lg">
                <span>{{ endpoint.name }}</span>
                <IconDiscountCheck class="lex-shrink-0 size-6 ms-4 text-green-700" v-if="hasEndpoint(endpoint.id)"/>
              </div>
              <div class="flex flex-row">
                <span class="font-bold me-2 text-gray-400">ID:</span>
                {{ endpoint.id }}
              </div>
              <div class="flex flex-row">
                <span class="font-bold me-2 text-gray-400">Variant:</span>
                {{ toEndpointVariantStr(endpoint.epVariant) }}
              </div>
              <div class="flex flex-row">
                <span class="font-bold me-2 text-gray-400">Public:</span>
                {{ endpoint.isPublic }}
              </div>
              <div class="flex flex-row">
                <span class="font-bold me-2 text-gray-400">Status:</span>
                {{ toComponentStatusStr(endpoint.status) }}
              </div>

              <div class="flex flex-row justify-end space-x-4">
                <Button v-if="endpoint.id && hasEndpoint(endpoint.id)"
                        :disabled="loading"
                        @click="getS3Credentials(endpoint)"
                        class="mt-2 bg-aruna-800 hover:bg-aruna-700 text-white text-md rounded-sm">
                  <IconLoader v-if="loading === endpoint.id+'_get'" class="w-4 h-4 mr-2 animate-spin"/>
                  Get Credentials
                </Button>
                <Button
                    v-if="endpoint.id && endpoint.status === storagemodelsv2ComponentStatus.COMPONENT_STATUS_AVAILABLE"
                    :disabled="loading"
                    @click="createS3Credentials(endpoint)"
                    class="mt-2 bg-aruna-800 hover:bg-aruna-700 text-white text-md rounded-sm">
                  <IconLoader v-if="loading === endpoint.id+'_create'" class="w-4 h-4 mr-2 animate-spin"/>
                  Create Credentials
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <Footer/>
</template>