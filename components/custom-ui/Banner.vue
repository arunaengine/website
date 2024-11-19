<script setup lang="ts">
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {
  IconTimelineEventExclamation,
  IconInfoCircle,
  IconRocket,
  IconServerOff,
  IconTrafficCone,
  IconX
} from '@tabler/icons-vue'

/* ----- PROPERTIES ----- */
interface ResourceCardProps {
  type: string,
  title: string,
  text: string,
  customImg: string
}

const {type, title, text} = defineProps<ResourceCardProps>()
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits(['hideBanner'])
/* ----- END EVENT EMITS ----- */
</script>

<template>
  <ClientOnly>
    <Alert class="bg-aruna-fg flex flex-col text-center sm:text-left sm:flex-row items-center justify-center mx-auto gap-x-6 gap-y-4">
      <div class="flex">
        <!--<div v-if="type === 'test'" class="h-10 w-10"></div>-->
        <img v-if="customImg" alt="Custom banner image" :src="customImg" class="h-24 mb-4 sm:h-12 sm:mb-0"/>
        <IconInfoCircle v-else-if="type === 'info'" class="size-10"/>
        <IconRocket v-else-if="type === 'release'" class="size-10"/>
        <IconTrafficCone v-else-if="type === 'maintenance'" id="myClip" class="size-10"/>
        <IconServerOff v-else-if="type === 'downtime'" class="size-10"/>
        <IconTimelineEventExclamation v-else-if="type === 'error'" class="size-10"/>
      </div>

      <div class="flex flex-col">
        <AlertTitle>{{ title }}</AlertTitle>
        <AlertDescription v-html="text" class="text-lg"/>
      </div>

      <Button class="inline-flex justify-end border-0 bg-transparent hover:bg-transparent hover:border hover:border-aruna-highlight"
              variant="outline"
              @click="emit('hideBanner')">
        <IconX class="size-4"/>
      </Button>
    </Alert>
  </ClientOnly>
</template>