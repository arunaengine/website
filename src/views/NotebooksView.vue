<script setup lang="ts">
// The notebooks entry: it returns to the notebook that was last open, and
// otherwise shows the ordinary data view with notebooks highlighted.
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataManagerView from '@/views/DataManagerView.vue'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useNotebookLocation } from '@/composables/useNotebookLocation'
import { useS3 } from '@/composables/useS3'

const router = useRouter()
const route = useRoute()
const saved = useNotebookLocation()
const initial = ref(saved.location.value)
watch(saved.scope, () => { initial.value = saved.location.value })
const s3 = useS3()
watch([saved.scope, () => route.query.browse, () => s3.activeContext.value], () => {
  if (route.query.browse === '1' || !saved.location.value?.key || s3.activeContext.value?.groupId !== activeGroupId.value) return
  void router.replace({ name: 'notebook', params: { bucketId: saved.location.value.bucket, key: saved.location.value.key }, query: { group: activeGroupId.value } })
}, { immediate: true })
</script>

<template>
  <DataManagerView />
</template>
