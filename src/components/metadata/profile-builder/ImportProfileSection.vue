<script setup lang="ts">
import { computed, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import { Upload, Globe, FileJson, FileCode2, CheckCircle2, AlertTriangle, Loader2, ListChecks } from '@lucide/vue'
import { isModeFile, MODELED_MODE_KEYS, modeBasics, modeToEntityRules } from '@/lib/profiles/mode'
import { missingShapesArtifacts, parseProfileCrate, resolveProfileArtifacts } from '@/lib/profiles/rocrate'
import { isRecord } from '@/lib/profiles/uri'
import { useAruna } from '@/composables/useAruna'
import { useArtifactFetch } from './useArtifactFetch'
import LiftNotesPanel from './LiftNotesPanel.vue'
import type { ProfileBasics } from '@/lib/profiles/types'
import type { LiftResult } from '@/lib/shacl/lift'
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
// A parsed SHACL file awaiting the author's choice: turn the shapes the builder
// understands into editable rules (keeping the file attached so the rest still
// validates), or keep the file attached and author nothing.
const pendingShacl = ref<{ text: string; fileName: string; lift: LiftResult } | null>(null)
// Confirmation of an attach-only choice.
const shaclNotice = ref<{ fileName: string; shapeCount: number } | null>(null)

// "Start from an existing profile": prefill the builder from any stored or
// built-in profile on this node — the same ingest path as an uploaded crate.
const { profiles, loadRoCrate } = useAruna()
const storedId = ref('')
const storedBusy = ref(false)

// Authenticated-when-possible artifact fetch, shared with the basics step's
// SHACL attach block (useArtifactFetch documents the resolution rules).
const { fetchArtifactText: fetchArtifact } = useArtifactFetch()
// Whether keeping the file attached actually buys anything: with no notes the
// generated shapes already say everything the file said, and attaching it too
// would only re-check the same constraints from a second shape.
const pendingResidual = computed(() => Boolean(pendingShacl.value?.lift.notes.length))

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
      customShapesText: profile.customShapesText,
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
async function ingest(json: unknown, baseUrl?: string) {
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
    const resolved = await resolveProfileArtifacts(json, fetchArtifact, baseUrl)
    const parsed = parseProfileCrate(resolved)
    const basics: Partial<ProfileBasics> = {
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      datePublished: parsed.datePublished,
      license: parsed.license,
    }
    // A crate whose only machine-readable artifact is SHACL (an externally
    // authored profile, which carries no Describo mode file) still describes
    // every field; lift its shapes rather than importing an empty draft.
    const lifted = parsed.entityRules.length || !parsed.shapesText
      ? undefined
      : await liftText(parsed.shapesText)
    result = {
      basics,
      entityRules: lifted?.entities ?? parsed.entityRules,
      mode: parsed.mode ?? null,
      kind: 'crate',
      preservedKeys: preservedKeys(parsed.mode),
      // An attached shapes.custom.ttl survives import verbatim.
      customShapesText: parsed.customShapesText,
      liftNotes: lifted?.notes,
    }
    if (!result.entityRules.length) {
      const missing = missingShapesArtifacts(resolved)
      if (missing.length) {
        throw new Error(`That profile crate keeps its rules in ${missing.join(', ')}, which is not part of the file you opened. Import the crate by URL so the file can be read alongside it, or upload the shapes file on its own.`)
      }
    }
  } else {
    throw new Error('Unrecognized file, expected a Describo/Crate-O mode file, an RO-Crate profile crate (with @graph), or a SHACL shapes file (.ttl).')
  }
  if (props.builder.hasEdits) {
    pendingImport.value = result
    error.value = ''
    return
  }
  apply(result)
}

// Route raw text: JSON documents go through the JSON ingest; anything else is
// treated as a SHACL Turtle file (plan 6.6).
async function ingestText(text: string, fileName: string, baseUrl?: string) {
  if (text.trim().startsWith('{')) {
    await ingest(JSON.parse(text), baseUrl)
    return
  }
  await ingestTurtle(text, fileName)
}

// lift.ts is loaded on demand so the Turtle parser stays out of the main bundle.
async function liftText(text: string): Promise<LiftResult> {
  const { liftShapes } = await import('@/lib/shacl/lift')
  try {
    return liftShapes(text)
  } catch (err) {
    throw new Error(`Not parseable as Turtle: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Bare SHACL file: lift whatever the rule model can express and offer the
// choice, falling straight through to attach-only when nothing lifted.
async function ingestTurtle(text: string, fileName: string) {
  const lift = await liftText(text)
  shaclNotice.value = null
  if (!lift.shapeCount) throw new Error('No SHACL node shapes found in that file.')
  if (!lift.fieldCount) {
    // Nothing became a field; attaching is the only thing left to offer.
    attachShacl(text, fileName, lift.shapeCount)
    props.builder.liftNotes = lift.notes
    return
  }
  pendingShacl.value = { text, fileName, lift }
  pendingImport.value = null
  error.value = ''
}

// "Create the fields": replaces the draft like any other import, so the existing
// has-edits confirmation applies. `attach` keeps the source file riding along as
// shapes.custom.ttl, which is what keeps the constraints the builder could not
// model (SPARQL rules, value exclusions) enforcing.
function convertPendingShacl(attach: boolean) {
  const pending = pendingShacl.value
  if (!pending) return
  pendingShacl.value = null
  const result: ProfileImportResult = {
    entityRules: pending.lift.entities,
    mode: null,
    kind: 'shacl',
    preservedKeys: [],
    liftNotes: pending.lift.notes,
    customShapesText: attach ? pending.text : undefined,
    customShapesName: pending.fileName,
  }
  if (props.builder.hasEdits) {
    pendingImport.value = result
    error.value = ''
    return
  }
  apply(result)
}

// "Keep attached only": no draft replacement, the file rides along verbatim.
function keepPendingShaclAttached() {
  const pending = pendingShacl.value
  if (!pending) return
  pendingShacl.value = null
  attachShacl(pending.text, pending.fileName, pending.lift.shapeCount)
  props.builder.liftNotes = []
}

function attachShacl(text: string, fileName: string, shapeCount: number) {
  props.builder.setCustomShapes(text, { fileName, shapeCount })
  shaclNotice.value = { fileName, shapeCount }
  error.value = ''
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
        await ingestText(String(reader.result), file.name)
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
    await ingestText(await fetchArtifact(target), target.split('/').pop() || target, target)
  } catch (err) {
    // A cross-origin browser fetch the remote host refuses surfaces as an opaque
    // TypeError. Portal-owned URLs are read through an authenticated GetObject
    // instead, so a TypeError here means an external server that blocks browser
    // access, which no client-side change can work around.
    if (err instanceof TypeError) {
      error.value = 'Could not fetch that URL. If it is hosted on another server (or redirects to one, like a w3id.org id), that server does not allow browser (cross-origin) access. Download the file and use Upload file instead.'
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
        Start from a Describo/Crate-O mode file, an RO-Crate profile crate, or a SHACL shapes file (.ttl). Rules we recognize become editable here; remaining SHACL constraints are preserved in the unified shapes.ttl.
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
      <input ref="fileInput" type="file" accept="application/json,.json,.ttl,text/turtle" class="hidden" @change="onFile" />
      <Button type="button" variant="outline" size="sm" @click="fileInput?.click()">
        <Upload class="size-3.5" /> Upload file
      </Button>
      <span class="text-[11px] text-muted-foreground">or</span>
      <div class="flex min-w-[220px] flex-1 items-center gap-2">
        <Input v-model="url" placeholder="https://…/mode.json or …/shapes.ttl" @keydown.enter="fromUrl" />
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

    <div v-if="pendingShacl" class="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
      <div class="flex items-center gap-2 font-medium text-foreground">
        <FileCode2 class="h-3.5 w-3.5 shrink-0 text-primary" />
        {{ pendingShacl.fileName }}: {{ pendingShacl.lift.shapeCount }} SHACL {{ pendingShacl.lift.shapeCount === 1 ? 'shape' : 'shapes' }},
        {{ pendingShacl.lift.fieldCount }} editable {{ pendingShacl.lift.fieldCount === 1 ? 'field' : 'fields' }}
        across {{ pendingShacl.lift.entities.length }} {{ pendingShacl.lift.entities.length === 1 ? 'entity' : 'entities' }}.
      </div>
      <p class="text-muted-foreground">
        <template v-if="pendingResidual">
          Creating the fields lets authors fill them in and see what each one requires. Including the original constraints alongside them means the
          constraints listed below, which no input can express, still run when a dataset is validated.
        </template>
        <template v-else>
          Every shape in the file maps to a rule, so the profile regenerates the same constraints from the fields, no attachment needed.
        </template>
      </p>

      <LiftNotesPanel :notes="pendingShacl.lift.notes" attached />

      <div class="flex flex-wrap items-center gap-2">
        <Button v-if="pendingResidual" type="button" size="sm" @click="convertPendingShacl(true)">
          Create {{ pendingShacl.lift.fieldCount }} fields, include all constraints
        </Button>
        <Button
          type="button"
          :variant="pendingResidual ? 'outline' : 'default'"
          size="sm"
          @click="convertPendingShacl(false)"
        >
          Create {{ pendingShacl.lift.fieldCount }} fields{{ pendingResidual ? ' only' : '' }}
        </Button>
        <Button type="button" variant="outline" size="sm" @click="keepPendingShaclAttached">Keep constraints only</Button>
        <Button type="button" variant="ghost" size="sm" @click="pendingShacl = null">Cancel</Button>
      </div>
    </div>

    <div v-if="shaclNotice" class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
      <div class="flex items-center gap-2 font-medium">
        <CheckCircle2 class="h-3.5 w-3.5" />
        Included {{ shaclNotice.fileName }} in the unified shapes.ttl ({{ shaclNotice.shapeCount }} {{ shaclNotice.shapeCount === 1 ? 'shape' : 'shapes' }}).
      </div>
      <p class="mt-1">Manage the imported source under SHACL shapes (advanced) in the Create tab.</p>
    </div>

    <!-- Attach-only imports where nothing could be lifted: say why, right here. -->
    <LiftNotesPanel v-if="shaclNotice && builder.liftNotes.length" :notes="builder.liftNotes" attached />

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
        Imported {{ builder.importSummary.kind === 'mode' ? 'mode file' : builder.importSummary.kind === 'shacl' ? 'SHACL shapes' : 'profile crate' }}<template v-if="builder.importSummary.name">: {{ builder.importSummary.name }}</template>
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
