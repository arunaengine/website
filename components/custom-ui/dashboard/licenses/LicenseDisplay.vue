<script setup lang="ts">
import {ScrollArea} from "~/components/ui/scroll-area";

// ----- Properties ---------- //
const selectedLicense = defineModel<License>('selectedLicense', {required: false})
// ----- End Properties ---------- //
</script>
<template>
  <div v-if="selectedLicense"
       class="p-4 flex flex-col gap-y-4 h-full">
    <h2 class="mt-6 mb-2 text-2xl font-bold text-aruna-text-accent">
      {{ selectedLicense.name }}
    </h2>
    <Separator/>
    <div class="font-bold text-aruna-text">
      {{ selectedLicense.description }}
    </div>
    <Separator/>
    <ScrollArea class="p-4 h-full overflow-hidden">
        <pre>{{ selectedLicense.terms }}</pre>
    </ScrollArea>
  </div>
</template>
