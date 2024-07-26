<script setup lang="ts">
import {IconChevronLeft} from '@tabler/icons-vue'
import type {v2Announcement} from "~/composables/aruna_api_json";

const route = useRoute()
const router = useRouter()
const announcement: Ref<v2Announcement | undefined> = ref(await getAnnouncement(route.params.id as string))
</script>
<style>
code {
  counter-reset: step;
  counter-increment: step 0;
}

code .line::before {
  content: counter(step);
  counter-increment: step;
  width: 1rem;
  margin-right: 1.5rem;
  display: inline-block;
  text-align: right;
  color: rgba(110, 115, 141, 1) /*rgba(115,138,148,.4)*/
}
</style>
<template>
  <NavigationTop/>

  <!-- Blog Article -->
  <div class="container max-w-5xl px-4 pt-6 lg:pt-10 pb-12 sm:px-6 lg:px-8 mx-auto">
    <div class="max-w-5xl">
      <!-- Avatar Media -->
      <div class="flex justify-between items-center mb-6">
        <div class="flex w-full sm:items-center gap-x-5 sm:gap-x-3">
          <div class="flex-shrink-0">
            <img class="size-12 rounded-full"
                 src="assets/imgs/aruna_icon.png"
                 alt="Image Description">
          </div>

          <div class="grow">
            <div class="flex justify-between items-center gap-x-2">
              <div>
                <span class="font-semibold text-gray-800 dark:text-neutral-200">
                    {{ announcement?.createdBy }}
                </span>

                <ul class="text-xs text-gray-500 dark:text-neutral-500">
                  <li class="inline-block relative pe-6 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-2 before:-translate-y-1/2 before:size-1 before:bg-gray-500 before:rounded-full dark:text-neutral-400 dark:before:bg-neutral-600">
                    {{ displayDate() }}
                  </li>
                </ul>
              </div>

              <!-- Button Group -->
              <div>
                <button type="button"
                        @click="router.back()"
                        class="py-1.5 px-2.5 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-900 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-800">
                  <IconChevronLeft class="size-3.5"/>
                  Back
                </button>
              </div>
              <!-- End Button Group -->
            </div>
          </div>
        </div>
      </div>
      <!-- End Avatar Media -->

      <!-- Content -->
      <div v-html="announcement?.content" :key="announcement?.content" class=""/>
      <!-- End Content -->

    </div>
  </div>
  <!-- End Blog Article -->

  <Footer/>
</template>