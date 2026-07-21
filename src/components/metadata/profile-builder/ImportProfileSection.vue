<script setup lang="ts">
import { computed, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import { Upload, Globe, FileJson, CheckCircle2, AlertTriangle, Loader2, ListChecks } from '@lucide/vue'
import { isModeFile, MODELED_MODE_KEYS, modeBasics, modeToEntityRules } from '@/lib/profiles/mode'
import { parseProfileCrate, resolveProfileArtifacts } from '@/lib/profiles/rocrate'
import { isRecord } from '@/lib/profiles/uri'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import type { ProfileBasics } from '@/lib/profiles/types'
import type { ProfileBuilder, ProfileImportResult } from './useProfileBuilder'

const props = defineProps<{ builder: ProfileBuilder }>()
const emit = defineEmits<{ (e: 'imported'): void }>()

const fileInput = ref<HTMLInputElement | null>(null)
const url = ref('')
const busy = ref(false)
const error = ref('')
// A parsed import held back because the builder already has edits; applied only
// after the author confirms the replacement.
const pendingImport = ref<ProfileImportResult | null>(null)

// "Start from an existing profile": prefill the builder from any stored or
// built-in profile on this node — the same ingest path as an uploaded crate.
const { profiles, loadRoCrate } = useAruna()
const s3 = useS3()
const storedId = ref('')
const storedBusy = ref(false)

// Fetch one profile artifact (or the pasted document itself) as text. A URL that
// resolves to a bucket on one of this realm's nodes is read through an
// authenticated GetObject, the same signed path the profiles view uses, so it
// works even when the object is not anonymously public or its bucket predates
// the public-read CORS rule. Anything else is a genuinely external host, fetched
// directly by the browser (and subject to that host's own CORS policy).
async function fetchArtifact(target: string): Promise<string> {
  const object = s3.hasActiveKey.value ? s3.resolveObjectUrl(target) : null
  if (object) return s3.getObjectText(object.bucket, object.key, object.nodeId)
  const response = await fetch(target)
  if (!response.ok) throw new Error(`Fetch failed (${response.status} ${response.statusText}).`)
  return response.text()
}
const storedOptions = computed(() =>
  profiles.value.map((profile) => ({
    value: profile.id,
    label: `${profile.name}${profile.builtIn ? ' (built-in)' : ''}`,
  })),
)

async function fromStored() {
  const profile = profiles.value.find((item) => item.id === storedId.value)
  if (!profile) return
  storedBusy.value = true
  error.value = ''
  try {
    if (profile.documentId) {
      await ingest(await loadRoCrate(profile.documentId))
      return
    }
    // Built-in profiles carry their parsed rules directly; no document to load.
    const result: ProfileImportResult = {
      basics: {
        name: profile.name,
        description: profile.description,
        version: profile.version,
      },
      entityRules: profile.entityRules,
      mode: profile.mode ?? null,
      kind: 'crate',
      preservedKeys: preservedKeys(profile.mode),
    }
    if (props.builder.hasEdits) {
      pendingImport.value = result
      return
    }
    apply(result)
  } catch (err) {
    fail(err)
  } finally {
    storedBusy.value = false
  }
}

// Detect a Describo/Crate-O mode file or an RO-Crate profile crate, map it into
// the builder, and remember the raw mode for verbatim re-export. The success
// summary lives on the builder (importSummary) so it survives tab navigation.
// Async because a public profile crate may reference its artifacts on S3
// (resolveProfileArtifacts fetches them before parsing).
async function ingest(json: unknown) {
  let result: ProfileImportResult
  if (isModeFile(json)) {
    result = {
      basics: modeBasics(json),
      entityRules: modeToEntityRules(json),
      mode: json,
      kind: 'mode',
      preservedKeys: preservedKeys(json),
    }
  } else if (isRecord(json) && Array.isArray(json['@graph'])) {
    const parsed = parseProfileCrate(await resolveProfileArtifacts(json, fetchArtifact))
    const basics: Partial<ProfileBasics> = {
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      datePublished: parsed.datePublished,
      license: parsed.license,
    }
    result = {
      basics,
      entityRules: parsed.entityRules,
      mode: parsed.mode ?? null,
      kind: 'crate',
      preservedKeys: preservedKeys(parsed.mode),
    }
  } else {
    throw new Error('Unrecognized file, expected a Describo/Crate-O mode file or an RO-Crate profile crate (with @graph).')
  }
  if (props.builder.hasEdits) {
    pendingImport.value = result
    error.value = ''
    return
  }
  apply(result)
}

function preservedKeys(mode: unknown): string[] {
  return isRecord(mode) ? Object.keys(mode).filter((key) => !MODELED_MODE_KEYS.has(key)) : []
}

function apply(result: ProfileImportResult) {
  props.builder.applyImport(result)
  pendingImport.value = null
  error.value = ''
  emit('imported')
}

function fail(err: unknown) {
  error.value = err instanceof Error ? err.message : String(err)
  pendingImport.value = null
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    void (async () => {
      try {
        await ingest(JSON.parse(String(reader.result)))
      } catch (err) {
        fail(err)
      }
    })()
  }
  reader.onerror = () => { error.value = 'Could not read that file.' }
  reader.readAsText(file)
  // Reset so re-selecting the same file fires change again.
  input.value = ''
}

async function fromUrl() {
  const target = url.value.trim()
  if (!target) return
  busy.value = true
  error.value = ''
  try {
    await ingest(JSON.parse(await fetchArtifact(target)))
  } catch (err) {
    // A cross-origin browser fetch the remote host refuses surfaces as an opaque
    // TypeError. Portal-owned URLs are read through an authenticated GetObject
    // instead, so a TypeError here means an external server that blocks browser
    // access, which no client-side change can work around.
    if (err instanceof TypeError) {
      error.value = 'Could not fetch that URL. If it is hosted on another server, that server does not allow browser (cross-origin) access. Download the file and use Upload JSON instead.'
      pendingImport.value = null
    } else {
      fail(err)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
    <div>
      <h4 class="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <FileJson class="h-4 w-4 text-primary" /> Import an existing profile
        <Badge variant="secondary">Describo/Crate-O-compatible</Badge>
      </h4>
      <p class="mt-1 text-xs text-muted-foreground">
        Start from a Describo/Crate-O mode file or an RO-Crate profile crate. Rules we recognize become editable here; everything else in the file is kept unchanged and written back on export.
      </p>
    </div>

    <!-- Start from a profile already on this node (stored or built-in). -->
    <div v-if="storedOptions.length" class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <span class="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
        <ListChecks class="h-3.5 w-3.5 text-primary" /> Start from an existing profile
      </span>
      <Select v-model="storedId" :options="storedOptions" placeholder="Choose a profile" class="h-8 min-w-[200px] flex-1 text-xs" />
      <Button type="button" variant="outline" size="sm" :disabled="storedBusy || !storedId" @click="fromStored">
        <Loader2 v-if="storedBusy" class="size-3.5 animate-spin" />
        <template v-else>Use as starting point</template>
      </Button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFile" />
      <Button type="button" variant="outline" size="sm" @click="fileInput?.click()">
        <Upload class="size-3.5" /> Upload JSON
      </Button>
      <span class="text-[11px] text-muted-foreground">or</span>
      <div class="flex min-w-[220px] flex-1 items-center gap-2">
        <Input v-model="url" placeholder="https://…/mode.json" @keydown.enter="fromUrl" />
        <Button type="button" variant="outline" size="sm" :disabled="busy || !url.trim()" @click="fromUrl">
          <Loader2 v-if="busy" class="size-3.5 animate-spin" />
          <Globe v-else class="size-3.5" /> Fetch
        </Button>
      </div>
    </div>

    <div v-if="error" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <div v-if="pendingImport" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <div class="flex items-center gap-2 font-medium">
        <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
        Importing replaces your current draft, the basics and every rule you have edited.
      </div>
      <div class="mt-2 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" @click="apply(pendingImport)">Replace draft</Button>
        <Button type="button" variant="ghost" size="sm" @click="pendingImport = null">Keep editing</Button>
      </div>
    </div>

    <div v-if="builder.importSummary" class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
      <div class="flex items-center gap-2 font-medium">
        <CheckCircle2 class="h-3.5 w-3.5" />
        Imported {{ builder.importSummary.kind === 'mode' ? 'mode file' : 'profile crate' }}<template v-if="builder.importSummary.name">: {{ builder.importSummary.name }}</template>
      </div>
      <p class="mt-1">
        {{ builder.importSummary.entityCount }} entity {{ builder.importSummary.entityCount === 1 ? 'rule' : 'rules' }},
        {{ builder.importSummary.propertyCount }} property {{ builder.importSummary.propertyCount === 1 ? 'rule' : 'rules' }} recognized.
      </p>
      <p v-if="builder.importSummary.preservedKeys.length" class="mt-1">
        Preserved but not editable: <code class="rounded bg-muted px-1">{{ builder.importSummary.preservedKeys.join(', ') }}</code>.
      </p>
    </div>

    <!-- A bare mode file has no vocabulary for constraints or recommended levels;
         those only come with a full profile crate (D1). -->
    <div v-if="builder.importSummary?.kind === 'mode'" class="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <FileJson class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Mode files carry form structure only, value constraints and recommended levels import when you upload a <b class="text-foreground">profile crate</b> instead.</span>
    </div>
  </div>
</template>
