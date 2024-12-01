<script lang="ts" setup>
import {IconExclamationCircle, IconX} from "@tabler/icons-vue";
import {type v2Author,} from "~/composables/aruna_api_json";
import {ULID_REGEX, ORCID_REGEX, EMAIL_REGEX} from "~/utils/constants";

const props = defineProps<{
  modalId: string,
}>()

const emit = defineEmits<{
  'add-author': [relation: v2Author]
}>()

const firstName = ref('')
const firstNameErr: Ref<string | undefined> = ref('Please enter a first name')
const lastName = ref('')
const lastNameErr: Ref<string | undefined> = ref('Please enter a last name')
const email = ref('')
const emailErr: Ref<string | undefined> = ref(undefined)
const orcid = ref('')
const orcidErr: Ref<string | undefined> = ref(undefined)
const userId = ref('')
const userIdErr: Ref<string | undefined> = ref(undefined)

const validState = ref(true)
const validationStates = ref(new Map<string, boolean>)
validationStates.value.set('firstname', false)
validationStates.value.set('lastname', false)
validationStates.value.set('email', true)
validationStates.value.set('orcid', true)
validationStates.value.set('userid', true)

watch(firstName, () => validateName())
watch(lastName, () => validateName())

function validateName() {
  // First name
  const firstValid = firstName.value.length > 0
  validationStates.value.set('firstname', firstValid)
  firstNameErr.value = firstValid ? undefined : 'Please enter a first name'

  // Last name
  const lastValid = lastName.value.length > 0
  validationStates.value.set('lastname', lastValid)
  lastNameErr.value = lastValid ? undefined : 'Please enter a last name'

  validation()
}

watch(email, () => validateEmail())

function validateEmail() {
  if (email.value.length > 0) {
    const valid = EMAIL_REGEX.test(email.value)
    validationStates.value.set('email', valid)
    emailErr.value = valid ? undefined : 'Please enter a valid email address'
  } else {
    validationStates.value.set('email', true)
    emailErr.value = undefined
  }
  validation()
}

watch(orcid, () => validateOrcid())

function validateOrcid() {
  if (orcid.value.length > 0) {
    const valid = ORCID_REGEX.test(orcid.value)
    validationStates.value.set('orcid', valid)
    orcidErr.value = valid ? undefined : 'Please enter a valid ORCID'
  } else {
    validationStates.value.set('orcid', true)
    orcidErr.value = undefined
  }
  validation()
}

watch(userId, () => validateUserId())

function validateUserId() {
  if (userId.value.length > 0) {
    const valid = ULID_REGEX.test(userId.value)
    validationStates.value.set('userid', valid)
    userIdErr.value = valid ? undefined : 'Please enter a valid ULID'
  } else {
    validationStates.value.set('userid', true)
    userIdErr.value = undefined
  }
  validation()
}

function validation() {
  for (const state of validationStates.value.values()) {
    if (!state) {
      validState.value = false
      return
    }
  }
  validState.value = true
}

function reset() {
  firstName.value = ''
  lastName.value = ''
  email.value = ''
  orcid.value = ''
  userId.value = ''
}

function submit() {
  emit('add-author', {
    firstName: firstName.value,
    lastName: lastName.value,
    email: email.value,
    orcid: orcid.value.length > 0 ? orcid.value : undefined,
    id: userId.value.length > 0 ? userId.value : undefined
  })
  reset()
}
</script>

<template>
  <div :id="props.modalId"
       class="hs-overlay hidden size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto pointer-events-none [--tab-accessibility-limited:false]">
    <div
        class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
      <div
          class="flex flex-col bg-gray-800 border shadow-sm rounded-md pointer-events-auto border-neutral-700 shadow-neutral-700/70">
        <div class="flex justify-between items-center py-3 px-4 border-b border-neutral-700">
          <h3 class="font-bold text-gray-200">
            Add Author
          </h3>
          <button :data-hs-overlay="`#${props.modalId}`" @click="reset"
                  class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-aruna-700"
                  type="button">
            <span class="sr-only">Close</span>
            <IconX class="flex-shrink-0 size-4"/>
          </button>
        </div>

        <div class="space-y-4 p-4 overflow-y-auto">
          <!-- Author First Name -->
          <div class="space-y-0">
            <div class="relative">
              <input v-model="firstName"
                     required
                     autofocus
                     id="first-name-input"
                     class="mt-2 peer p-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm placeholder:text-transparent focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2"
                     placeholder="Author first name" type="text">
              <label class="text-gray-300 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="first-name-input">First Name</label>
              <div :class="{ 'hidden': validationStates.get('firstname') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': validationStates.get('firstname') }" class="text-sm text-red-600"
               id="hs-validation-name-error-helper">{{ firstNameErr }}
            </p>
          </div>
          <!-- End Author First Name -->

          <!-- Author Last Name -->
          <div class="space-y-0">
            <div class="relative">
              <input v-model="lastName"
                     required
                     id="last-name-input"
                     class="mt-2 peer p-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm placeholder:text-transparent focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2"
                     placeholder="Author last name"
                     type="text">
              <label class="text-gray-300 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="last-name-input">Last Name</label>
              <div :class="{ 'hidden': validationStates.get('lastname') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': validationStates.get('lastname') }" class="text-sm text-red-600"
               id="hs-validation-name-error-helper">{{ lastNameErr }}
            </p></div>
          <!-- End Author First Name -->

          <!-- Author Email -->
          <div class="space-y-0">
            <div class="relative">
              <input v-model="email"
                     id="author-email-input"
                     class="mt-2 peer p-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm placeholder:text-transparent focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2"
                     placeholder="Author email"
                     type="email">
              <label class="text-gray-300 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="author-email-input">Email</label>
              <div :class="{ 'hidden': validationStates.get('email') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': validationStates.get('email') }" class="text-sm text-red-600"
               id="hs-validation-name-error-helper">{{ emailErr }}
            </p>
          </div>
          <!-- End Author Email -->

          <!-- Author ORCID -->
          <div class="space-y-0">
            <div class="relative">
              <input v-model="orcid"
                     id="author-orcid-input"
                     class="mt-2 peer p-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm placeholder:text-transparent focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2"
                     placeholder="Author ORCID"
                     type="email">
              <label class="text-gray-300 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="author-orcid-input">ORCID</label>
              <div :class="{ 'hidden': validationStates.get('orcid') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': validationStates.get('orcid') }" class="text-sm text-red-600"
               id="hs-validation-name-error-helper">{{ orcidErr }}
            </p>
          </div>
          <!-- End Author ORCID -->

          <!-- Author User ID -->
          <div class="space-y-0">
            <div class="relative">
              <input v-model="userId"
                     id="author-userid-input"
                     class="mt-2 peer p-4 block w-full border-gray-700 rounded-md bg-slate-900 text-gray-300 text-sm placeholder:text-transparent focus:border-aruna-700 focus:ring-aruna-700 disabled:opacity-50 disabled:pointer-events-none
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2"
                     placeholder="Author user id"
                     type="email">
              <label class="text-gray-300 absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-gray-500
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-gray-500" for="author-userid-input">User ID</label>
              <div :class="{ 'hidden': validationStates.get('userid') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
            <p :class="{ 'hidden': validationStates.get('userid') }" class="text-sm text-red-600"
               id="hs-validation-name-error-helper">{{ userIdErr }}
            </p>
          </div>
          <!-- End User ID -->
        </div>

        <div class="flex justify-end items-center gap-x-2 py-3 px-4 border-t border-gray-700">
          <button type="button" @click="reset"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-gray-700 bg-slate-900 text-gray-200 shadow-sm hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none"
                  :data-hs-overlay="`#${props.modalId}`">
            Close
          </button>
          <button type="button" :disabled="!validState"
                  @click="submit"
                  class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none"
                  :data-hs-overlay="`#${props.modalId}`">
            Add Author
          </button>
        </div>
      </div>
    </div>
  </div>
</template>