<script lang="ts" setup>
import {IconX} from "@tabler/icons-vue";

const props = defineProps<{
  modalId: string,
}>()

const endpointUlid = ref('')
const s3Host = ref('')
const accessKeyId = ref('')
const accessSecret = ref('')
const errorMsg: Ref<string | undefined> = ref('')

async function createS3Credentials(endpointId: string) {
  // Set endpoint id
  endpointUlid.value = endpointId
  // Fetch S3 credentials
  await createUserS3Credentials(endpointId)
      .then(response => {
        s3Host.value = response.s3EndpointUrl ? response.s3EndpointUrl : ''
        accessKeyId.value = response.s3AccessKey ? response.s3AccessKey : ''
        accessSecret.value = response.s3SecretKey ? response.s3SecretKey : ''
        errorMsg.value = undefined

        EventBus.emit('updateUser')
      }).catch(error => {
        errorMsg.value = error.toString()
        reset(false)
      })
}

async function getS3Credentials(endpointId: string): Promise<boolean> {
  return await getUserS3Credentials(endpointId)
      .then(response => {
        endpointUlid.value = endpointId
        s3Host.value = response.s3EndpointUrl ? response.s3EndpointUrl : ''
        accessKeyId.value = response.s3AccessKey ? response.s3AccessKey : ''
        accessSecret.value = response.s3SecretKey ? response.s3SecretKey : ''
        errorMsg.value = undefined

        return true
      })
      .catch(error => {
        console.log(error)
        reset(false)

        return false
      })
}

function reset(withId: boolean) {
  if (withId) {
    endpointUlid.value = ''
    errorMsg.value = undefined
  }
  s3Host.value = ''
  accessKeyId.value = ''
  accessSecret.value = ''
}

defineExpose({
  createS3Credentials,
  getS3Credentials
})
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto [--overlay-backdrop:static]"
       data-hs-overlay-keyboard="false">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div
          class="flex flex-col rounded-lg bg-white border shadow-sm  pointer-events-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]">
        <div class="flex justify-between items-center py-3 px-4 dark:border-gray-700">
          <h3 class="font-bold text-gray-800 dark:text-white">
            Your S3 Credentials for:
            <span class="font-bold text-aruna-800"> {{ endpointUlid }}</span>
          </h3>
          <button type="button"
                  @click="reset(true)"
                  :data-hs-overlay="`#${props.modalId}`"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>
        <div v-if="errorMsg" class="p-4 overflow-y-auto text-red-500">
          {{ errorMsg }}
        </div>
        <div v-else class="p-4 overflow-y-auto">
          <div class="border-t border-gray-100">
            <dl class="divide-y divide-gray-100">
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">DataProxy Host</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{{ s3Host }}</dd>
              </div>
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">Access Key ID</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{{ accessKeyId }}</dd>
              </div>
              <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt class="text-sm font-medium leading-6 text-gray-900">Access Secret</dt>
                <dd class="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{{ accessSecret }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>