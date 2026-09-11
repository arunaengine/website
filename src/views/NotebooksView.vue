<script setup lang="ts">
// The notebooks entry: it returns to the notebook that was last open, and
// otherwise shows the ordinary data view with notebooks highlighted.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataManagerView from '@/views/DataManagerView.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useNotebookLocation } from '@/composables/useNotebookLocation'

const router = useRouter()
const route = useRoute()
const saved = useNotebookLocation()
const initial = ref(saved.location.value)
watch(saved.scope, () => { initial.value = saved.location.value })
// The saved location is stored per scope, which already names the active
// group, so returning here reopens it without waiting for a storage session.
// The data view is held back meanwhile: its own last-bucket redirect would
// otherwise win the race and show the picker instead of the notebook.
const reopening = computed(() => route.query.browse !== '1' && Boolean(saved.location.value?.key))
watch([saved.scope, () => route.query.browse], () => {
  if (!reopening.value || !saved.location.value?.key) return
  void router.replace({ name: 'notebook', params: { bucketId: saved.location.value.bucket, key: saved.location.value.key }, query: { group: activeGroupId.value } })
}, { immediate: true })
</script>

<template>
  <Spinner v-if="reopening" class="mx-auto my-16" />
  <DataManagerView v-else />
</template>
