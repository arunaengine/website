<script setup lang="ts">
import {IconEdit, IconIdBadge2} from "@tabler/icons-vue";
import type {v2Author, v2Stats} from "~/composables/aruna_api_json";

// v-model
const editMode = defineModel<boolean>('editMode')

// Props
const props = defineProps<{
  name: string,
  title: string | undefined
  editable: boolean
}>()
const editable = ref<boolean>(props.editable)
const editedTitle = ref<string | undefined>(props.title)

// Events
const emit = defineEmits<{
  'update-title': [title: string | undefined]
}>()
</script>

<template>
  <div class="flex flex-col grow items-start bg-aruna-bg/90 border border-aruna-text/50 shadow-sm p-4 md:p-5 text-aruna-text">
    <div class="flex flex-row w-full">
      <!-- Big Icon Column -->
      <div class="flex flex-col items-center justify-center text-aruna-highlight">
        <IconIdBadge2 class="flex-shrink-0 size-10"/>
      </div>
      <!-- END Big Icon Column -->

      <!-- Name & Title Column -->
      <div class="flex flex-col w-full ms-6">
        <div class="flex flex-row space-x-2 border-aruna-text/50">
          <div class="text-lg text-aruna-text">Name:</div>
          <div class="font-bold text-xl text-aruna-text-accent">{{ props.name }}</div>
        </div>

        <div class="flex w-full justify-between items-center space-x-2 border-aruna-text/50">
          <div class="flex gap-2 w-full items-center">
            <span class="text-lg text-aruna-text">Title:</span>
            <div v-if="props.title && editMode" class="flex flex-col gap-2 w-full">
              <Input type="text"
                     v-model="editedTitle"
                     placeholder="Title of the resource"
                     class="py-1 px-3 my-1 h-auto w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                              focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                              focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                              disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
              <div class="flex gap-4">
                <Button @click="emit('update-title', editedTitle)"
                        variant="outline"
                        class="w-fit bg-transparent border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
                  Save
                </Button>
                <Button @click="editMode = false" variant="outline" class="w-fit border-aruna-text text-aruna-text">
                  Cancel
                </Button>
              </div>
            </div>
            <span v-else-if="props.title  && !editMode" class="font-bold text-xl text-aruna-text-accent">{{
                props.title
              }}</span>
            <span v-else class="font-bold text-xl text-aruna-text-accent">N/A</span>
          </div>
          <IconEdit v-if="!editMode && editable"
                    @click="editMode = true"
                    class="flex flex-shrink-0 text-aruna-text-accent hover:cursor-pointer"/>
        </div>
      </div>
      <!-- END Name Column -->
    </div>
  </div>
</template>