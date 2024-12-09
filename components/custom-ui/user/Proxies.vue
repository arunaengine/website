<script setup lang="ts">
import {
  storagemodelsv2ComponentStatus,
  type v2Endpoint,
  type v2User
} from "~/composables/aruna_api_json";
import {IconDiscountCheck, IconLoader} from "@tabler/icons-vue";
import {useToast} from "~/components/ui/toast";
import CredentialsDialog from "~/components/custom-ui/dialog/CredentialsDialog.vue";

interface ProxiesProps {
  userEndpoints: string[],
  endpoints: v2Endpoint[]
}

const {userEndpoints, endpoints} = defineProps<ProxiesProps>()

function hasEndpoint(endpointId?: string): boolean {
  if (endpointId)
    return userEndpoints.includes(endpointId)
  return false
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

const {toast} = useToast()
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

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

async function createS3Credentials(endpoint: v2Endpoint) {
  // Indicate async loading in progress (disable buttons)
  loading.value = `${endpoint.id}_create`

  await sleep(3000)

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
  loading.value = `${endpoint.id}_get`
  EventBus.emit('spinStart')

  await sleep(3000)

  // Fetch existing S3 credentials
  return await getUserS3Credentials(endpoint.id)
      .then(response => {
        loading.value = undefined // Re-activate buttons
        EventBus.emit('spinStop')

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
        EventBus.emit('spinStop')

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
  <div class="m-4 p-4 flex flex-row flex-wrap rounded-sm border border-dashed border-aruna-text/50 gap-x-4 gap-y-4 text-gray-600">
    <div v-for="endpoint in endpoints"
         class="flex flex-col space-y-1 bg-slate-900 border border-gray-700 shadow-sm rounded-xl p-4 md:p-5 text-gray-300">
      <div class="flex flex-row font-bold items-center justify-between text-aruna-700 text-lg">
        <span :class="{'animate-spin': loading}">{{ endpoint.name }}</span>
        <IconDiscountCheck v-if="hasEndpoint(endpoint.id)"
                           class="lex-shrink-0 size-6 ms-4 text-green-700"
                           :class="{'animate-spin': loading}"/>
      </div>
      <div class="flex flex-row"
           :class="{'animate-spin': loading}">
        <span class="font-bold me-2 text-gray-400">ID:</span>
        {{ endpoint.id }}
      </div>
      <div class="flex flex-row"
           :class="{'animate-spin': loading}">
        <span class="font-bold me-2 text-gray-400">Variant:</span>
        {{ toEndpointVariantStr(endpoint.epVariant) }}
      </div>
      <div class="flex flex-row"
           :class="{'animate-spin': loading}">
        <span class="font-bold me-2 text-gray-400">Public:</span>
        {{ endpoint.isPublic }}
      </div>
      <div class="flex flex-row"
           :class="{'animate-spin': loading}">
        <span class="font-bold me-2 text-gray-400">Status:</span>
        {{ toComponentStatusStr(endpoint.status) }}
      </div>

      <div class="flex flex-row justify-end space-x-4"
           :class="{'animate-spin': loading}">
        <Button v-if="endpoint.id && hasEndpoint(endpoint.id)"
                :disabled="loading"
                @click="getS3Credentials(endpoint)"
                class="mt-2 bg-aruna-800 hover:bg-aruna-700 text-white text-md rounded-sm">
          <IconLoader v-if="loading === endpoint.id+'_get'" class="w-4 h-4 mr-2 animate-spin"/>
          Get Credentials
        </Button>
        <Button v-if="endpoint.id && endpoint.status === storagemodelsv2ComponentStatus.COMPONENT_STATUS_AVAILABLE"
                :disabled="loading"
                @click="createS3Credentials(endpoint)"
                class="mt-2 bg-aruna-800 hover:bg-aruna-700 text-white text-md rounded-sm">
          <IconLoader v-if="loading === endpoint.id+'_create'" class="w-4 h-4 mr-2 animate-spin"/>
          Create Credentials
        </Button>
      </div>
    </div>
  </div>

  <!-- Credentials Dialog -->
  <CredentialsDialog :initial-open="credentialsDialogOpen"
                     :with-button="false"
                     :host-id="credentials?.endpointId || ''"
                     :host-name="credentials?.endpointName || ''"
                     :host-url="credentials?.endpointHost || ''"
                     :access-key-id="credentials?.accessKeyId || ''"
                     :access-secret="credentials?.accessSecret || ''"
                     @update:open="clear"/>
  <!-- END Credentials Dialog -->
</template>
