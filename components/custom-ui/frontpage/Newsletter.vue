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
       class="container w-full mt-12 border border-aruna-text/50 bg-aruna-bg/90 rounded-md px-4 py-10 sm:px-6 lg:px-8 lg:py-16 mx-auto">
    <div class="grid md:grid-cols-2 gap-8">
      <div class="max-w-md">
        <h2 class="text-2xl font-bold md:text-3xl md:leading-tight text-aruna-text-accent">
          Mailing List
        </h2>
        <p class="mt-3 text-aruna-text">
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
                         class="peer p-4 block w-full rounded-md text-sm placeholder:text-transparent focus:border-aruna-highlight focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted border-aruna-text/50 text-aruna-text
                   focus:pt-6
                   focus:pb-2
                   [&:not(:placeholder-shown)]:pt-6
                   [&:not(:placeholder-shown)]:pb-2
                   autofill:pt-6
                   autofill:pb-2">
                  <label class="text-aruna-text absolute top-0 start-0 p-4 h-full text-sm truncate pointer-events-none transition ease-in-out duration-100 border border-transparent peer-disabled:opacity-50 peer-disabled:pointer-events-none
            peer-focus:text-xs
            peer-focus:-translate-y-1.5
            peer-focus:text-aruna-text/75
            peer-[:not(:placeholder-shown)]:text-xs
            peer-[:not(:placeholder-shown)]:-translate-y-1.5
            peer-[:not(:placeholder-shown)]:text-aruna-text/75" for="user-mail-input">Your email address</label>
                  <div :class="{ 'hidden': emailInputInfo === undefined }"
                       class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                    <IconCircleCheck v-if="success" class="flex-shrink-0 size-4 text-green-500"/>
                    <IconExclamationCircle v-else class="flex-shrink-0 size-4 text-destructive"/>
                  </div>
                </div>
                <p id="user-mail-input-helper"
                   class="mt-2 text-sm text-center"
                   :class="{'hidden': emailInputInfo === undefined, 'text-destructive': !success, 'text-green-700': success}"
                   v-html="emailInputInfo"/>
              </div>
              <!-- End User Email Address -->
            </div>
            <button type="button"
                    @click="submit"
                    :disabled="processing"
                    class="w-full sm:w-auto whitespace-nowrap px-4 py-2 h-14 gap-x-2 text-sm font-semibold rounded-md border border-aruna-highlight bg-transparent text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-aruna-700">
              Subscribe
            </button>

          </div>
          <p class="mt-3 text-sm text-aruna-text">
            No spam, unsubscribe at any time.
          </p>
        </div>
      </form>
    </div>
  </div>
</template>
