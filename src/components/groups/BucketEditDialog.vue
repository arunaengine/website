<script setup lang="ts">
// Edit one linked bucket: naming, mappings and schedule in Settings, clean-up steps in Organize.
import { computed, ref, watch } from 'vue'
import BucketOrganize from '@/components/groups/BucketOrganize.vue'
import MappingList from '@/components/groups/MappingList.vue'
import JobProgress from '@/components/storage/JobProgress.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import { useAruna } from '@/composables/useAruna'
import { useLinkState } from '@/composables/useLinkState'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { getFileRules, saveFileRules, startImportRenames, updateBackendImport, type BackendImport } from '@/lib/api'
import {
  BIG_BUCKET,
  customProblem,
  NAMING_OPTIONS,
  namingChoice,
  namingExample,
  namingPattern,
  scheduleOptions,
  shownPattern,
  type NamingChoice,
} from '@/lib/bucketNaming'
import { sameMappings, mappingProblem, toMapping, toRule, type Mapping } from '@/lib/bucketMappings'
import { organizeError } from '@/lib/organize'
import { errorMessage, formatNumber } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  link: BackendImport
  /** The storage name and S3 bucket, such as "spire / aruna-spire-genes". */
  storage: string
  place: string
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'saved'): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()
const { renames, status, job, error: stateError, controlling, finished, refresh, control } = useLinkState(
  () => props.groupId,
  () => props.link.import_id,
)

const tab = ref('settings')
const choice = ref<NamingChoice>('plain')
const custom = ref('')
const renameOld = ref(true)
const schedule = ref('')
const mappings = ref<Mapping[]>([])
const savedMappings = ref<Mapping[]>([])
const mappingsKnown = ref(false)
const savedPattern = ref('')
const savedSchedule = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)
const savedNote = ref(false)

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const pattern = computed(() => namingPattern(choice.value, custom.value))
const nameError = computed(() => (choice.value === 'custom' ? customProblem(custom.value) : null))
const nameChanged = computed(() => shownPattern(pattern.value) !== shownPattern(savedPattern.value))
const mappingsChanged = computed(() => mappingsKnown.value && !sameMappings(mappings.value, savedMappings.value))
const dirty = computed(() => nameChanged.value || schedule.value !== savedSchedule.value || mappingsChanged.value)
const invalid = computed(() => Boolean(nameError.value) || mappings.value.some((mapping) => mappingProblem(mapping)))
const offersRename = computed(() => nameChanged.value && choice.value !== 'prefix')
const hourlyWarning = computed(() => {
  const files = status.value?.files
  return schedule.value === '0 * * * *' && files !== undefined && files >= BIG_BUCKET
    ? `Hourly syncs of ${formatNumber(files)} files cause steady S3 traffic.`
    : null
})

let opening = 0
async function loadMappings(id: number) {
  try {
    const { rules } = await getFileRules(props.groupId, props.link.import_id, client())
    if (id !== opening) return
    savedMappings.value = rules.map(toMapping)
    mappings.value = rules.map(toMapping)
    mappingsKnown.value = true
  } catch (err) {
    if (id === opening) saveError.value = `Mappings could not be read: ${organizeError(err)}`
  }
}

watch(
  () => [props.open, props.link.import_id, sessionEpoch.value],
  () => {
    if (!props.open) return
    const id = ++opening
    tab.value = 'settings'
    savedPattern.value = props.link.write_pattern ?? '{dir}{name}'
    choice.value = namingChoice(savedPattern.value)
    custom.value = choice.value === 'custom' ? shownPattern(savedPattern.value) : ''
    savedSchedule.value = props.link.schedule ?? ''
    schedule.value = savedSchedule.value
    renameOld.value = true
    mappingsKnown.value = false
    mappings.value = []
    savedMappings.value = []
    saveError.value = null
    savedNote.value = false
    saving.value = false
    void loadMappings(id)
    void refresh()
  },
  { immediate: true },
)

function pickChoice(value: string) {
  choice.value = value as NamingChoice
  if (value === 'custom' && !custom.value) custom.value = '{name}'
}

async function save() {
  if (!dirty.value || invalid.value || saving.value || writesDisabled.value) return
  saving.value = true
  saveError.value = null
  savedNote.value = false
  const id = opening
  const link = props.link.import_id
  const rename = offersRename.value && renameOld.value
  // What is sent; edits made while it saves stay as a newer draft.
  const sentSchedule = schedule.value
  const sentPattern = nameChanged.value ? pattern.value : undefined
  const sentMappings = mappingsChanged.value ? mappings.value.map((mapping) => ({ ...mapping })) : null
  try {
    if (sentPattern !== undefined || sentSchedule !== savedSchedule.value) {
      await updateBackendImport(props.groupId, link, sentSchedule || null, client(), sentPattern)
      if (id !== opening) return
      if (sentPattern !== undefined) savedPattern.value = sentPattern
      savedSchedule.value = sentSchedule
    }
    if (sentMappings) {
      const { rules } = await saveFileRules(props.groupId, link, sentMappings.map(toRule), client())
      if (id !== opening) return
      savedMappings.value = rules.map(toMapping)
      if (sameMappings(mappings.value, sentMappings)) mappings.value = rules.map(toMapping)
    }
    if (rename) await startImportRenames(props.groupId, link, client())
    if (id !== opening) return
    savedNote.value = true
    emit('saved')
    void refresh()
  } catch (err) {
    if (id === opening) saveError.value = errorMessage(err)
  } finally {
    if (id === opening) saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ link.bucket }}</DialogTitle>
        <DialogDescription>{{ storage }} / <span class="font-mono">{{ place }}</span></DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab" class="max-h-[70vh] overflow-y-auto px-1 scrollbar-thin">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="organize">Organize</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" class="grid gap-4">
          <div>
            <label class="text-xs font-medium">New uploads are named</label>
            <Select
              :model-value="choice"
              :options="NAMING_OPTIONS"
              aria-label="New uploads are named"
              class="mt-1"
              @update:model-value="pickChoice"
            />
            <Input
              v-if="choice === 'custom'"
              v-model="custom"
              class="mt-2 font-mono"
              placeholder="{name}"
              aria-label="Custom name"
              :invalid="nameError ? 'error' : undefined"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">
              <span class="font-mono">{name}</span> is the file name, <span class="font-mono">{id}</span> the version ID.
            </p>
            <p v-if="nameError" class="mt-1 text-xs text-destructive">{{ nameError }}</p>
            <p v-else class="mt-1 text-xs text-muted-foreground">
              {{ nameChanged ? 'After saving' : 'Example' }}:
              <span class="font-mono text-foreground">{{ namingExample(pattern) }}</span>
            </p>
            <label v-if="offersRename" class="mt-2 flex items-center gap-2 text-xs">
              <input v-model="renameOld" type="checkbox" />
              Also rename the files that use the old style
            </label>
          </div>

          <MappingList
            v-if="mappingsKnown"
            v-model="mappings"
            :group-id="groupId"
            :link="link"
            :saved="savedMappings"
            :job="job"
            :controlling="controlling"
            @started="refresh"
            @control="control"
          />
          <p v-else-if="!saveError" class="text-xs text-muted-foreground">Loading mappings…</p>

          <div>
            <label class="text-xs font-medium">Look for new files</label>
            <Select
              v-model="schedule"
              :options="scheduleOptions(savedSchedule)"
              aria-label="Look for new files"
              class="mt-1"
            />
            <Notice v-if="hourlyWarning" tone="warning" class="mt-2">{{ hourlyWarning }}</Notice>
          </div>

          <div v-if="job?.kind === 'rename'" class="rounded-md border border-border bg-muted/50 px-3 py-2">
            <JobProgress :job="job" :busy="controlling" @control="control" />
          </div>
          <Notice v-if="saveError || stateError" tone="error">{{ saveError ?? stateError }}</Notice>
          <p v-if="savedNote && !dirty" class="text-xs text-muted-foreground">
            Saved.<template v-if="savedMappings.length"> Use Apply… to move files already in Aruna.</template>
          </p>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose as-child><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button
              size="sm"
              :disabled="!dirty || invalid || saving || writesDisabled"
              :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="organize">
          <BucketOrganize
            :group-id="groupId"
            :link="link"
            :place="place"
            :renames="renames"
            :job="job"
            :controlling="controlling"
            :finished="finished"
            @started="refresh"
            @control="control"
          />
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
