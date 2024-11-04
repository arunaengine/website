<script setup lang="ts">
import {IconChevronDown} from "@tabler/icons-vue";
import {getAnnouncements} from "~/composables/api_wrapper";
import {type v2Announcement, v2AnnouncementType} from "~/composables/aruna_api_json";

const announcements: Ref<v2Announcement[]> = ref([])
const exhausted = ref(true)
const last_id = ref('')

async function extendDisplay() {
  const fetched_announcements = await getAnnouncements(last_id.value, 3)

  // Evaluate announcements fetch
  const fetched_last_id = fetched_announcements[fetched_announcements.length - 1] ? fetched_announcements[fetched_announcements.length - 1].announcementId : undefined

  exhausted.value = fetched_last_id == undefined || fetched_announcements.length < 3
  last_id.value = fetched_last_id ? fetched_last_id : last_id.value

  announcements.value.push(...fetched_announcements)
}

onBeforeMount(async () => await extendDisplay())
</script>
<template>
  <NavigationTop/>

  <div class="min-h-[calc(100vh-110px)]">
    <div class="md:container sm:mx-1 md:mx-auto mt-8">
      <!-- Card Blog -->
      <div class="max-w-[85rem] p-4 sm:px-6 lg:px-8 mx-auto">
        <!-- Grid -->
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardNews v-for="announcement in announcements"
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
            <button @click="extendDisplay"
                    :class="{hidden: exhausted}"
                    class="py-3 px-4 inline-flex items-center gap-x-1 text-sm font-medium rounded-full border border-aruna-highlight bg-aruna-bg/90 hover:bg-aruna-muted text-aruna-highlight hover:text-aruna-highlight/80 shadow-sm disabled:opacity-50 disabled:pointer-events-none">
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