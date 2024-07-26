<script setup lang="ts">
import {v2AnnouncementType} from "~/composables/aruna_api_json";
import {toAnnouncementTypeStr} from "~/composables/enum_conversions";

const props = defineProps<{
  id: string,
  type: v2AnnouncementType,
  title: string,
  teaser: string,
  imageUrl: string,
  author: string,
  created_at: string,
  modified_by: string,
  modified_at: string
}>()
</script>
<template>
  <!-- Card -->
  <NuxtLink :to="`/articles/${id}`"
            class="group flex flex-col h-full border border-gray-400 hover:border-aruna-800 hover:shadow-2xl transition-all duration-300 rounded-md p-5 dark:border-neutral-700 dark:hover:border-transparent dark:hover:shadow-white/40">
    <div class="aspect-w-16 aspect-h-11">
      <img v-if="imageUrl" class="w-full object-cover rounded-md"
           :src="imageUrl"
           alt="Announcement preview image">
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_RELEASE'" class="w-full object-cover rounded-md"
           src="assets/imgs/blog_release.webp"
           alt="Default image for release announcements">
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_UPDATE'" class="w-full object-cover rounded-md"
           src="assets/imgs/blog_update.webp"
           alt="Default image for update announcements">
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_BLOG'" class="w-full object-cover rounded-md"
           src="assets/imgs/blog_blog.webp"
           alt="Default image for blog articles">
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_MAINTENANCE'" class="w-full object-cover rounded-md"
           src="assets/imgs/blog_maintenance.webp"
           alt="Default image for maintenance announcements">
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_ORGA'" class="w-full object-cover rounded-md"
           src="assets/imgs/blog_orga.webp"
           alt="Default image for organizational announcements">
    </div>
    <div class="my-6">
      <h3 class="text-xl font-semibold text-gray-800 dark:text-neutral-300 dark:group-hover:text-white">
        {{ title }}
      </h3>
      <p class="mt-5 text-gray-600 dark:text-neutral-400">
        {{ teaser }}
      </p>
    </div>
    <div class="mt-auto flex justify-between items-center gap-x-3">
      <div class="flex">
        <img class="size-8 rounded-full" src="assets/imgs/aruna_icon.png"
             alt="Minimalistic Aruna icon in the form of a wave">
        <div class="ms-2.5 sm:ms-4">
          <h4 class="text-sm text-gray-800 dark:text-neutral-200">
            {{ author }}
          </h4>
          <div v-if="created_at !== modified_at"
               class="hs-tooltip [--placement:right] inline-block">
            <button type="button" class="hs-tooltip-toggle text-xs text-gray-500 dark:text-neutral-500">
              {{ displayDate(created_at, modified_at) }}
            </button>
            <span role="tooltip"
                  class="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible opacity-0 transition-opacity inline-block absolute invisible z-10 py-1 px-2 bg-gray-900 text-xs font-medium text-white rounded shadow-sm dark:bg-neutral-700">
              Originally posted: {{ formatDate(created_at) }}
            </span>
          </div>
          <p v-else class="inline-block text-xs text-gray-500 dark:text-neutral-500">
            {{ formatDate(created_at) }}
          </p>
        </div>
      </div>
      <div
          class="flex px-4 py-2 ms-2.5 sm:ms-4 font-bold text-aruna-800 dark:text-aruna-700 rounded-md border border-aruna-800/[.25] dark:border-aruna-700/[.25]">
        {{ toAnnouncementTypeStr(type) }}
      </div>
    </div>
  </NuxtLink>
  <!-- End Card -->
</template>