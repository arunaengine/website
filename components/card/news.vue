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
  modified_at: string,
  featured?: boolean
}>()

// Show the branded tile when the external image cannot be loaded.
// A server-rendered image may fail before hydration, so check once mounted.
const imageFailed = ref(false)
const image = ref<HTMLImageElement | null>(null)
onMounted(() => {
  if (image.value?.complete && image.value.naturalWidth === 0) imageFailed.value = true
})
</script>
<template>
  <!-- Card -->
  <NuxtLink :to="`/articles/${id}`"
            :class="featured ? 'sm:col-span-2 lg:col-span-3 lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-8 lg:p-5' : 'flex flex-col'"
            class="group h-full p-4 border border-border rounded-xl bg-card transition-colors duration-200 hover:border-aruna-aqua/60 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div class="aspect-[16/10] overflow-hidden rounded-lg bg-muted">
      <img v-if="imageUrl && !imageFailed"
           ref="image"
           :src="imageUrl"
           width="800"
           height="500"
           :loading="featured ? 'eager' : 'lazy'"
           :fetchpriority="featured ? 'high' : 'auto'"
           decoding="async"
           @error="imageFailed = true"
           alt="Announcement preview image"
           class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
      <div v-else
           class="relative grid size-full place-items-center bg-aruna-navy">
        <div aria-hidden="true"
             class="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(85,196,222,0.3),transparent_55%),radial-gradient(circle_at_85%_90%,rgba(54,62,201,0.35),transparent_55%)]"/>
        <div class="relative text-center">
          <div class="relative mx-auto aspect-[935/537] h-10 overflow-hidden">
            <img src="/brand/icon-mark.avif"
                 alt=""
                 loading="lazy"
                 class="absolute left-[-19.6%] top-[-62%] w-[134.1%] max-w-none select-none"/>
          </div>
          <p class="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">
            {{ toAnnouncementTypeStr(type) }}
          </p>
        </div>
      </div>
    </div>
    <div class="flex flex-col" :class="featured ? 'lg:justify-center' : 'flex-1'">
      <div class="mt-5 mb-6">
        <h3 :class="featured ? 'text-xl lg:text-2xl' : 'text-lg line-clamp-2'"
            class="font-display font-semibold leading-snug text-foreground group-hover:text-aruna-aqua">
          {{ title }}
        </h3>
        <p :class="featured ? 'line-clamp-5' : 'line-clamp-3'"
           class="mt-3 text-sm leading-relaxed text-muted-foreground">
          {{ teaser }}
        </p>
      </div>
      <div class="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        <time :datetime="created_at">{{ shortDate(created_at) }}</time>
        <span aria-hidden="true">&middot;</span>
        <span class="rounded-full border border-aruna-aqua/40 bg-aruna-aqua/10 px-2 py-0.5 text-[11px] font-medium text-aruna-aqua">
          {{ toAnnouncementTypeStr(type) }}
        </span>
      </div>
    </div>
  </NuxtLink>
  <!-- End Card -->
</template>
