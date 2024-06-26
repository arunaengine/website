<script lang="ts" setup>
import {EMAIL_REGEX} from "~/composables/constants";
import type {v2RegisterUserResponse} from "~/composables/aruna_api_json";
import {IconExclamationCircle} from "@tabler/icons-vue";

const props = defineProps<{
  modalId: string,
}>()

// ----- Form field states ----- //
const userName = ref('')
const userNameErr: Ref<string | undefined> = ref(undefined)
watch(userName, () => {
  const nameValid = userName.value.length > 0
  validationStates.value.set('userName', nameValid)
  userNameErr.value = nameValid ? undefined : 'Please enter a display name'

  validation()
})

const userMail = ref('')
const userMailErr: Ref<string | undefined> = ref(undefined)
watch(userMail, () => {
  if (userMail.value.length > 0) {
    const valid = EMAIL_REGEX.test(userMail.value)
    validationStates.value.set('userMail', valid)
    userMailErr.value = valid ? undefined : 'Please enter a valid email address'
  } else {
    validationStates.value.set('userMail', false)
    userMailErr.value = 'Please enter a valid email address'
  }
  validation()
})

const userProject = ref('')
const userProjectErr: Ref<string | undefined> = ref(undefined)
watch(userProject, () => {
  const projectValid = userProject.value.length > 0
  validationStates.value.set('userProject', projectValid)
  userProjectErr.value = projectValid ? undefined : 'Please enter your associated project'

  validation()
})

const tosAccepted = ref(false)
watch(tosAccepted, () => {
  validationStates.value.set('tosAccepted', tosAccepted.value)
  validation()
})
// ----- End Form field states ----- //

// ----- Form Validation ----- //
const validState = ref(false)
const validationStates = ref(new Map<string, boolean>)
validationStates.value.set('userName', false)
validationStates.value.set('userMail', false)
validationStates.value.set('userProject', false)
validationStates.value.set('tosAccepted', false)

function validation() {
  for (const state of validationStates.value.values()) {
    if (!state) {
      validState.value = false
      return
    }
  }
  validState.value = true
}
// ----- End Form Validation ----- //

async function submitRegistration() {
  await $fetch<v2RegisterUserResponse>('/api/register', {
    method : 'POST',
    body: {
      displayName: userName.value,
      email: userMail.value,
      project: userProject.value
    }
  }).then(response => {
    console.log(response.userId)
    if (response.userId) {
      closeModal(props.modalId)
      EventBus.emit('updateUser')
    }
  }).catch(error => {
    alert(error)
  })
}

function closeModal(modalId: string) {
  let element = document.querySelector(`#${modalId}`) as HTMLElement
  import('preline').then(({HSOverlay}) => {
    HSOverlay.close(element)
  })
}
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden transition duration fixed inset-0 bg-gray-900 bg-opacity-50 dark:bg-opacity-80 hs-overlay-backdrop size-full top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div class="bg-white border border-gray-200 rounded-xl shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div
            class="p-4 sm:p-7 relative flex flex-col bg-white border shadow-sm rounded-xl overflow-hidden dark:bg-gray-800 dark:border-gray-700">
          <div class="absolute top-2 end-2">
            <button type="button"
                    @click="closeModal(props.modalId)"
                    class="flex justify-center items-center size-7 text-sm font-semibold rounded-lg border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:border-transparent dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
              <span class="sr-only">Close</span>
              <svg class="flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                   stroke-linejoin="round">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="text-center">
            <h2 class="block text-2xl font-bold text-gray-800 dark:text-gray-200">
              Registration required
            </h2>
          </div>

          <div class="mt-5 space-y-4 p-4 overflow-y-auto">
            <!-- User Display Name -->
            <div class="space-y-0">
              <div class="relative">
                <input required
                       type="text"
                       id="user-name-input"
                       v-model="userName"
                       placeholder="User display name"
                       class="mt-2 peer p-4 block w-full border-gray-200 rounded-lg text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2">
                <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="user-name-input">Name</label>
                <div :class="{ 'hidden': validationStates.get('userName') }"
                     class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                  <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
                </div>
              </div>
              <p :class="{ 'hidden': validationStates.get('userName') }" class="text-sm text-red-600"
                 id="hs-validation-name-error-helper">{{ userNameErr }}
              </p>
            </div>
            <!-- End User Display Name-->
            <!-- User Email Address -->
            <div class="space-y-0">
              <div class="relative">
                <input required type="text"
                       id="user-mail-input"
                       v-model="userMail"
                       placeholder="User email address"
                       class="mt-2 peer p-4 block w-full border-gray-200 rounded-lg text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2">
                <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="user-mail-input">Email address</label>
                <div :class="{ 'hidden': validationStates.get('userMail') }"
                     class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                  <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
                </div>
              </div>
              <p :class="{ 'hidden': validationStates.get('userMail') }" class="text-sm text-red-600"
                 id="hs-validation-name-error-helper">{{ userMailErr }}
              </p>
            </div>
            <!-- End User Email Address -->
            <!-- User Project -->
            <div class="space-y-0">
              <div class="relative">
                <input required
                       type="text"
                       v-model="userProject"
                       id="user-project-input"
                       placeholder="Associated user project"
                       class="mt-2 peer p-4 block w-full border-gray-200 rounded-lg text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2">
                <label class="text-slate-400 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent dark:text-white peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="user-project-input">Associated Project</label>
                <div :class="{ 'hidden': validationStates.get('userProject') }"
                     class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                  <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
                </div>
              </div>
              <p :class="{ 'hidden': validationStates.get('userProject') }"
                 class="text-sm text-red-600"
                 id="hs-validation-name-error-helper">
                {{ userProjectErr }}
              </p>
            </div>
            <!-- End User Project -->
            <!-- ToS Checkbox -->
            <div class="flex items-center">
              <div class="flex">
                <input required
                       v-model="tosAccepted"
                       id="tos"
                       name="tos"
                       type="checkbox"
                       class="shrink-0 mt-0.5 border-gray-200 rounded text-blue-600 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:checked:bg-blue-500 dark:checked:border-blue-500 dark:focus:ring-offset-gray-800">
              </div>
              <div class="ms-3">
                <label for="tos"
                       class="text-sm dark:text-white">
                  I accept the
                  <a href="/tos" target="_blank"
                     class="text-blue-600 decoration-2 hover:underline font-medium dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                    Terms and Conditions
                  </a>
                </label>
              </div>
            </div>
            <!-- End ToS Checkbox -->

            <button :disabled="!validState"
                    :data-hs-overlay="`#${props.modalId}`"
                    @click="submitRegistration"
                    class="w-full py-3 px-4 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
              Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>