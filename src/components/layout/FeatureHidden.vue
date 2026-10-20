<script setup lang="ts">
// A page of a feature the user hid still opens; this says so and offers to show it again.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { featureAvailable, featureInfo, type PortalFeature } from '@/lib/features'

const route = useRoute()
const { shown, setChoice } = usePortalFeatures()

const hidden = computed(() => {
  const key = route.meta.feature as PortalFeature | undefined
  return key && featureAvailable(key) && !shown(key) ? featureInfo(key) : undefined
})
</script>

<template>
  <div v-if="hidden" class="container pt-6">
    <Notice :title="`${hidden.label} is hidden`">
      <p>Turn it on in Settings to see it in the menu.</p>
      <Button size="sm" variant="outline" class="mt-2" @click="setChoice(hidden.key, true)">Show {{ hidden.label }}</Button>
    </Notice>
  </div>
</template>
