<script setup lang="ts">
import {EMAIL_REGEX} from "~/composables/constants";
import {IconCircleCheck, IconExclamationCircle} from "@tabler/icons-vue";

const email = ref('')
const emailInputInfo: Ref<string | undefined> = ref(undefined)
const displayName = ref('')

const processing = ref(false)
const success = ref(false)

async function submit() {
  if (email.value.length <= 0) {
    emailInputInfo.value = undefined
  } else if (!EMAIL_REGEX.test(email.value)) {
    emailInputInfo.value = 'Please enter a valid email address'
  } else {
    // Valid input
    emailInputInfo.value = undefined
    processing.value = true

    // Try to register email to mailing list
    await $fetch<boolean>('/api/newsletter_register', {
      method: 'POST',
      body: {
        email: email.value,
      }
    }).then(result => {
      console.log(result)
      success.value = result
      if (result) {
        emailInputInfo.value = 'Subscribe request successfully sent.<br/>Please check your inbox for further instructions.'
      } else {
        emailInputInfo.value = 'Failed to send registration request.<br/>Please try again later or contact the website administrator.'
      }
    }).catch(err => {
      console.log(err)
      success.value = false
      emailInputInfo.value = 'Failed to send registration request.<br/>Please try again later or contact the website administrator.'
    }).finally(() => {
      processing.value = false
    })
  }
}

</script>
<template>
  <div id="mailing-list"
       class="container w-full mt-12 bg-[#080d1f]/[.6] rounded-md px-4 py-10 sm:px-6 lg:px-8 lg:py-16 mx-auto">
    <div class="grid md:grid-cols-2 gap-8">
      <div class="max-w-md">
        <h2 class="text-2xl font-bold md:text-3xl md:leading-tight dark:text-white">
          Mailing List
        </h2>
        <p class="mt-3 text-gray-600 dark:text-gray-400">
          Subscribe and get all the latest Aruna updates and news.
        </p>
      </div>

      <form>
        <div class="w-full sm:max-w-lg md:ms-auto">
          <div class="flex flex-col sm:flex-row items-top gap-2 sm:gap-3">
            <div class="w-full">
              <!-- User Email Address -->
              <div class="">
                <div class="relative">
                  <input type="text"
                         id="user-mail-input"
                         v-model="email"
                         placeholder="Your email address"
                         class="peer p-4 block w-full border-gray-200 rounded-md text-sm placeholder:text-transparent focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-300 dark:focus:ring-gray-600
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
            peer-[:not(:placeholder-shown)]:text-gray-500" for="user-mail-input">Your email address</label>
                  <div :class="{ 'hidden': emailInputInfo === undefined }"
                       class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                    <IconCircleCheck v-if="success" class="flex-shrink-0 size-4 text-green-500"/>
                    <IconExclamationCircle v-else class="flex-shrink-0 size-4 text-red-500"/>
                  </div>
                </div>
                <p id="user-mail-input-helper"
                   class="mt-2 text-sm text-center"
                   :class="{'hidden': emailInputInfo === undefined, 'text-red-600': !success, 'text-green-700': success}"
                   v-html="emailInputInfo"/>
              </div>
              <!-- End User Email Address -->
            </div>
            <button type="button"
                    @click="submit"
                    :disabled="processing"
                    class="w-full sm:w-auto whitespace-nowrap p-4 h-14 gap-x-2 text-sm font-semibold rounded-md border border-transparent bg-aruna-800 text-white hover:bg-aruna-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
              Subscribe
            </button>

          </div>
          <p class="mt-3 text-sm text-gray-500">
            No spam, unsubscribe at any time.
          </p>
        </div>
      </form>
    </div>
  </div>
</template>
