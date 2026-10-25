<script setup lang="ts">
// A linked part shows the current files of a bucket or folder. Browsing opens them in the Data
// section, where the bucket's own read permission decides what is listed. The other datasets that
// link the same part are one click away.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import LinkedDatasets from '@/components/data/LinkedDatasets.vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { apiErrorMessage } from '@/lib/api'
import { browseProblem, browseRoute } from '@/lib/linkedPart'
import { FolderOpen, Link2 } from '@lucide/vue'

const props = defineProps<{ id: string; datasetId: string }>()

const { getPartTarget } = useAruna()
const { isLocalNode } = useRealmNodes()
const router = useRouter()

const busy = ref(false)
const problem = ref<string | null>(null)
const others = ref(false)

async function browse() {
  busy.value = true
  problem.value = null
  try {
    const target = await getPartTarget(props.id)
    problem.value = browseProblem(target, isLocalNode)
    if (!problem.value) await router.push(browseRoute(target, isLocalNode))
  } catch (cause) {
    problem.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mt-1 space-y-1.5">
    <div class="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" :disabled="busy" @click.stop="browse"><FolderOpen class="size-3.5" /> Browse the files</Button>
      <Button variant="ghost" size="sm" @click.stop="others = !others"><Link2 class="size-3.5" /> Also linked by</Button>
    </div>
    <p v-if="problem" class="text-[11px] font-normal text-muted-foreground">{{ problem }}</p>
    <div v-if="others" class="text-[11px] font-normal" @click.stop>
      <LinkedDatasets heading="Also linked by" :target="{ bucket: '', key: '', folder: false, remote: false, id }" :exclude="datasetId" />
    </div>
  </div>
</template>
