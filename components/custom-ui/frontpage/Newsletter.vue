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
  <section id="mailing-list" class="section">
    <div class="container max-w-6xl">
    <div class="grid items-center gap-8 rounded-xl border border-border bg-card p-6 sm:p-10 md:grid-cols-2">
      <div class="max-w-md">
        <div class="eyebrow">Stay informed</div>
        <h2 class="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Mailing list
        </h2>
        <p class="mt-3 text-muted-foreground">
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
                         class="peer p-4 block w-full rounded-md text-sm placeholder:text-transparent focus:border-aruna-highlight focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none bg-background border-input text-foreground
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
                    <IconCircleCheck v-if="success" class="flex-shrink-0 size-4 text-emerald-400"/>
                    <IconExclamationCircle v-else class="flex-shrink-0 size-4 text-destructive"/>
                  </div>
                </div>
                <p id="user-mail-input-helper"
                   class="mt-2 text-sm text-center"
                   :class="{'hidden': emailInputInfo === undefined, 'text-destructive': !success, 'text-emerald-400': success}"
                   v-html="emailInputInfo"/>
              </div>
              <!-- End User Email Address -->
            </div>
            <button type="button"
                    @click="submit"
                    :disabled="processing"
                    class="w-full sm:w-auto whitespace-nowrap px-5 h-14 text-sm font-medium rounded-md bg-aruna-royal text-white hover:bg-aruna-royal/90 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
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
  </section>
</template>
