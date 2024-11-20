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

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean,
  withButton: boolean,
  hostId: string,
  hostName: string,
  hostUrl: string,
  accessKeyId: string,
  accessSecret: string,
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
        Show Credentials
      </Button>
    </DialogTrigger>
    <DialogContent @close="emit('closeCredentialsDialog')" class="sm:max-w-lg sm:rounded-md border-aruna-text/50">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-highlight font-bold">DataProxy Credentials</DialogTitle>
        <DialogDescription v-if="hostName" class="text-center text-aruna-text">
          <p class="mb-2 text-md">Your S3 credentials for: <span class="font-bold italic text-aruna-text-accent">{{ hostName }}</span></p>
          <p class="text-sm font-bold">{{ hostId }}</p>
        </DialogDescription>
      </DialogHeader>
      <div class="p-4 overflow-y-auto">
        <div class="border-y border-aruna-text">
          <dl>
            <div class="p-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-aruna-text">Host URL</dt>
              <dd class="mt-1 text-sm leading-6 text-aruna-text-accent sm:col-span-2 sm:mt-0">{{ hostUrl }}</dd>
            </div>
            <div class="p-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-aruna-text">Access Key ID</dt>
              <dd class="mt-1 text-sm leading-6 text-aruna-text-accent sm:col-span-2 sm:mt-0">{{ accessKeyId }}</dd>
            </div>
            <div class="p-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt class="text-sm font-medium leading-6 text-aruna-text">Access Secret</dt>
              <dd class="mt-1 text-sm leading-6 text-aruna-text-accent sm:col-span-2 sm:mt-0">{{ accessSecret }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>