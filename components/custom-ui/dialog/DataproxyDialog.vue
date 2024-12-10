<script setup lang="ts">
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type {v2Endpoint} from "~/composables/aruna_api_json";

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean,
  withButton: boolean,
  endpoint: v2Endpoint
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => open.value = externalTrigger.value)
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits(['closeCredentialsDialog'])
/* ----- END EVENT EMITS ----- */
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline">
        Show DataProxy
      </Button>
    </DialogTrigger>
    <DialogContent @close="emit('closeCredentialsDialog')"
                   class="sm:max-w-screen-md sm:rounded-md">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-700 font-bold">{{ endpoint.name }}</DialogTitle>
        <DialogDescription v-if="endpoint.name" class="text-center">
          <p class="mb-2 text-md"><span class="font-bold italic">{{ endpoint.id }}</span></p>
          <!--<p class="text-sm">{{ endpoint.id }}</p>-->
        </DialogDescription>
      </DialogHeader>
      <div class="p-4 overflow-y-auto">
        <div class="border-y border-gray-100">
          <dl class="divide-y divide-gray-100">
            <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-gray-400">Status</dt>
              <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">{{ endpoint.status }}</dd>
            </div>
            <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-gray-400">Public Endpoint</dt>
              <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">{{ endpoint.isPublic }}</dd>
            </div>
            <!--
            <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-gray-400">Has Modules</dt>
              <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                {{ endpoint.hostConfigs && endpoint.hostConfigs.length > 0 }}
              </dd>
            </div>-->
            <div v-if="endpoint.hostConfigs && endpoint.isPublic" class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-gray-400">Modules</dt>
              <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">
                <pre>{{ JSON.stringify(endpoint.hostConfigs, null, 2) }}</pre>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>