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
  <div class="container max-w-5xl px-4 pt-6 lg:pt-10 pb-12 sm:px-6 lg:px-8 mx-auto my-10 bg-aruna-bg/90 rounded-sm border border-aruna-text/50">
    <div class="max-w-5xl">
      <!-- Avatar Media -->
      <div class="flex justify-between items-center mb-6">
        <div class="flex w-full sm:items-center gap-x-5 sm:gap-x-3">
          <div class="flex-shrink-0">
            <img src="/imgs/aruna_icon.webp"
                     alt="Image Description"
                     class="size-12 rounded-full"/>
          </div>

          <div class="grow">
            <div class="flex justify-between items-center gap-x-2">
              <div>
                <span class="font-semibold text-aruna-text-accent">
                    {{ announcement?.createdBy }}
                </span>

                <ul class="text-xs text-aruna-text">
                  <li class="inline-block relative pe-6 last:pe-0 last-of-type:before:hidden before:absolute before:top-1/2 before:end-2 before:-translate-y-1/2 before:size-1 before:rounded-full text-aruna-text before:bg-aruna-bg-90">
                    <div v-if="announcement?.createdAt !== announcement?.modifiedAt"
                         class="hs-tooltip [--placement:right] inline-block">
                      <button type="button"
                              class="hs-tooltip-toggle text-xs text-aruna-text">
                        {{ displayDate(announcement?.createdAt, announcement?.modifiedAt) }}
                      </button>
                      <span role="tooltip"
                            class="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible opacity-0 transition-opacity inline-block absolute invisible z-10 py-1 px-2 bg-muted text-gray-300 text-xs font-medium text-white rounded shadow-sm">
                        Originally posted: {{ formatDate(announcement?.createdAt) }}
                      </span>
                    </div>
                    <p v-else class="inline-block text-xs text-aruna-text">
                      {{ formatDate(announcement?.createdAt) }}
                    </p>
                  </li>
                </ul>
              </div>

              <!-- Button Group -->
              <div>
                <button type="button"
                        @click="router.back()"
                        class="py-1.5 px-2.5 inline-flex items-center gap-x-2 text-sm font-medium rounded-md border border-aruna-text/50 bg-aruna-bg/90 text-aruna-text shadow-sm disabled:opacity-50 disabled:pointer-events-none hover:bg-aruna-muted">
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