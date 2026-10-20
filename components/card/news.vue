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

// Show the default picture when the external image cannot be loaded
const imageFailed = ref(false)
</script>
<template>
  <!-- Card -->
  <NuxtLink :to="`/articles/${id}`"
            class="group flex flex-col h-full p-4 border border-border rounded-xl bg-card transition-colors duration-200 hover:border-aruna-aqua/60 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div class="aspect-[16/10] overflow-hidden rounded-lg bg-muted">
      <img v-if="imageUrl && !imageFailed"
           :src="imageUrl"
           @error="imageFailed = true"
           alt="Announcement preview image"
           class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_RELEASE'"
               src="/imgs/blog_release.webp"
               class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
               alt="Default image for release announcements"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_UPDATE'"
               src="/imgs/blog_update.webp"
               alt="Default image for update announcements"
               class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_BLOG'"
               src="/imgs/blog_blog.webp"
               alt="Default image for blog articles"
               class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_MAINTENANCE'"
               src="/imgs/blog_maintenance.webp"
               alt="Default image for maintenance announcements"
               class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
      <img v-else-if="type === 'ANNOUNCEMENT_TYPE_ORGA'"
               src="/imgs/blog_orga.webp"
               alt="Default image for organizational announcements"
               class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
    </div>
    <div class="mt-5 mb-6">
      <h3 class="font-display text-lg font-semibold leading-snug text-aruna-text-accent line-clamp-2 group-hover:text-aruna-aqua">
        {{ title }}
      </h3>
      <p class="mt-3 text-sm leading-relaxed text-aruna-text line-clamp-3">
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
          class="flex px-2 py-0.5 ms-2.5 sm:ms-4 text-[11px] font-medium text-aruna-aqua rounded-full border border-aruna-aqua/40 bg-aruna-aqua/10">
        {{ toAnnouncementTypeStr(type) }}
      </div>
    </div>
  </NuxtLink>
  <!-- End Card -->
</template>