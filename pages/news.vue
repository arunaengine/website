<script setup lang="ts">
import {IconChevronDown} from "@tabler/icons-vue";
import {getAnnouncements} from "~/composables/api_wrapper";
import {type v2Announcement, v2AnnouncementType} from "~/composables/aruna_api_json";

const announcements: Ref<v2Announcement[]> = ref([])
const exhausted = ref(true)
const last_id = ref('')

async function extendDisplay(count = 3) {
  const fetched_announcements = await getAnnouncements(last_id.value, count)

  // Evaluate announcements fetch
  const fetched_last_id = fetched_announcements[fetched_announcements.length - 1] ? fetched_announcements[fetched_announcements.length - 1].announcementId : undefined

  exhausted.value = fetched_last_id == undefined || fetched_announcements.length < count
  last_id.value = fetched_last_id ? fetched_last_id : last_id.value

  announcements.value.push(...fetched_announcements)
}

// One wide card plus a full row of three
onBeforeMount(async () => await extendDisplay(4))
</script>
<template>
  <NavigationTop/>

  <div class="min-h-[calc(100vh-110px)]">
    <div>
      <!-- Card Blog -->
      <div class="container max-w-6xl py-12">
        <div class="mb-10 max-w-2xl">
          <div class="eyebrow">News</div>
          <h1 class="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Blog and announcements
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            Releases, updates and stories from the Aruna project.
          </p>
        </div>
        <!-- Grid -->
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardNews v-for="(announcement, index) in announcements"
                    :featured="index === 0"
                    :id="announcement.announcementId || ''"
                    :type="announcement.announcementType || v2AnnouncementType.ANNOUNCEMENT_TYPE_UNSPECIFIED"
                    :imageUrl="announcement.imageUrl || ''"
                    :title="announcement.title || ''"
                    :teaser="announcement.teaser || ''"
                    :author="announcement.createdBy || ''"
                    :created_at="announcement.createdAt || new Date().toString()"
                    :modified_by="announcement.modifiedBy || ''"
                    :modified_at="announcement.modifiedAt || new Date().toString()"/>
        </div>
        <!-- End Grid -->

        <!-- Extend Button -->
        <div class="mt-12 text-center">
          <ClientOnly>
            <button @click="extendDisplay()"
                    :class="{hidden: exhausted}"
                    class="py-3 px-4 inline-flex items-center gap-x-1 text-sm font-medium rounded-md border border-input bg-transparent hover:bg-accent text-foreground disabled:opacity-50 disabled:pointer-events-none">
              Show older news
              <IconChevronDown class="flex-shrink-0 size-4"/>
            </button>
          </ClientOnly>
        </div>
        <!-- End Extend Button -->
      </div>
      <!-- End Card Blog -->
    </div>
  </div>

  <Footer/>
</template>