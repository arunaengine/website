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
            class="group flex flex-col h-full p-5 border-2 border-aruna-text/50 rounded-md bg-aruna-bg/90 transition-all delay-50 duration-500 hover:border-aruna-highlight hover:shadow-2xl hover:scale-105 hover:shadow-aruna-highlight/40 focus:outline-none focus:ring-2 focus:ring-aruna-highlight">
    <div class="aspect-w-16 aspect-h-11">
      <img v-if="imageUrl"
           :src="imageUrl"
           alt="Announcement preview image"
           class="w-full object-cover rounded-md"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_RELEASE'"
               src="/imgs/blog_release.webp"
               class="w-full object-cover rounded-md"
               alt="Default image for release announcements"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_UPDATE'"
               src="/imgs/blog_update.webp"
               alt="Default image for update announcements"
               class="w-full object-cover rounded-md"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_BLOG'"
               src="/imgs/blog_blog.webp"
               alt="Default image for blog articles"
               class="w-full object-cover rounded-md"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_MAINTENANCE'"
               src="/imgs/blog_maintenance.webp"
               alt="Default image for maintenance announcements"
               class="w-full object-cover rounded-md"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_ORGA'"
               src="/imgs/blog_orga.webp"
               alt="Default image for organizational announcements"
               class="w-full object-cover rounded-md"/>
    </div>
    <div class="my-6">
      <h3 class="text-xl font-semibold text-aruna-text-accent">
        {{ title }}
      </h3>
      <p class="mt-5 text-aruna-text">
        {{ teaser }}
      </p>
    </div>
    <div class="mt-auto flex justify-between items-center gap-x-3">
      <div class="flex">
        <img src="/imgs/aruna_icon.webp"
                 alt="Minimalistic Aruna icon in the form of a wave"
                 class="size-8 rounded-full"/>
        <div class="ms-2.5 sm:ms-4">
          <h4 class="text-sm text-aruna-text">
            {{ author }}
          </h4>
          <div v-if="created_at !== modified_at"
               class="hs-tooltip [--placement:right] inline-block">
            <button type="button" class="hs-tooltip-toggle text-xs text-aruna-text">
              {{ displayDate(created_at, modified_at) }}
            </button>
            <span role="tooltip"
                  class="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible opacity-0 transition-opacity inline-block absolute invisible z-10 py-1 px-2 bg-aruna-muted text-xs font-medium text-white rounded shadow-sm">
              Originally posted: {{ formatDate(created_at) }}
            </span>
          </div>
          <p v-else class="inline-block text-xs text-aruna-text">
            {{ formatDate(created_at) }}
          </p>
        </div>
      </div>
      <div
          class="flex px-4 py-2 ms-2.5 sm:ms-4 font-bold text-aruna-highlight rounded-md border border-aruna-highlight">
        {{ toAnnouncementTypeStr(type) }}
      </div>
    </div>
  </NuxtLink>
  <!-- End Card -->
</template>