<script setup lang="ts">
import { ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import { ChevronDown, FileCode2, Globe, Upload, X } from '@lucide/vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useArtifactFetch } from './useArtifactFetch'
import { sameSchemaOrgType } from '@/lib/profiles/uri'
import { errorMessage } from '@/lib/utils'
import type { ProfileEntityRule } from '@/lib/profiles/types'
import type { ProfileBuilder } from './useProfileBuilder'

// `locked` freezes the profile's stored identity (owning group and slug/path)
// while editing an existing document; all other fields stay editable.
const props = defineProps<{ builder: ProfileBuilder; locked?: boolean }>()
const builder = props.builder

// Inline error per basics input, from the same field-keyed validation that
// gates the step's Next button (basicsFieldErrors), so the two never drift.
function fieldError(fieldId: string): string {
  return builder.basicsFieldErrors.find((error) => error.fieldId === fieldId)?.message ?? ''
}

// --- SHACL shapes (advanced): merge/replace/remove imported source shapes. The
// generated and imported sections are exported together as shapes.ttl. Turtle
// parsing goes through a dynamic import
// of lift.ts so n3 never enters the main bundle.
const shapesOpen = ref(false)
const shapesFileInput = ref<HTMLInputElement | null>(null)
const shapesUrl = ref('')
const shapesBusy = ref(false)
const shapesError = ref('')
const { fetchArtifactText } = useArtifactFetch()

function mergeEntityRules(current: ProfileEntityRule[], incoming: ProfileEntityRule[]): ProfileEntityRule[] {
  const merged = current.map((entity) => ({ ...entity, propertyRules: [...entity.propertyRules] }))
  for (const entity of incoming) {
    const existing = merged.find((candidate) => sameSchemaOrgType(candidate.type, entity.type))
    if (!existing) {
      merged.push(entity)
      continue
    }
    for (const property of entity.propertyRules) {
      const index = existing.propertyRules.findIndex((candidate) => sameSchemaOrgType(candidate.propertyUri, property.propertyUri))
      if (index >= 0) existing.propertyRules[index] = property
      else existing.propertyRules.push(property)
    }
  }
  return merged
}

async function attachShapesText(text: string, fileName: string) {
  shapesError.value = ''
  shapesBusy.value = true
  try {
    const { liftShapes } = await import('@/lib/shacl/lift')
    let lift
    try {
      lift = liftShapes(text)
    } catch (err) {
      shapesError.value = `Not parseable as Turtle: ${errorMessage(err)}`
      return
    }
    if (!lift.shapeCount) {
      shapesError.value = 'That file parses as Turtle but contains no SHACL node shapes.'
      return
    }
    if (lift.fieldCount) {
      builder.applyImport({
        entityRules: mergeEntityRules(builder.normalizedEntities, lift.entities),
        mode: builder.importedMode,
        kind: 'shacl',
        customShapesText: text,
        customShapesName: fileName,
        liftNotes: lift.notes,
      })
    } else {
      builder.setCustomShapes(text, { fileName, shapeCount: lift.shapeCount })
    }
    shapesUrl.value = ''
  } finally {
    shapesBusy.value = false
  }
}

function onShapesFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { void attachShapesText(String(reader.result), file.name) }
  reader.onerror = () => { shapesError.value = 'Could not read that file.' }
  reader.readAsText(file)
  input.value = ''
}

async function shapesFromUrl() {
  const target = shapesUrl.value.trim()
  if (!target) return
  shapesBusy.value = true
  shapesError.value = ''
  try {
    const text = await fetchArtifactText(target)
    await attachShapesText(text, target.split('/').pop() || 'shapes.ttl')
  } catch (err) {
    shapesError.value = err instanceof TypeError
      ? 'Could not fetch that URL. If it is hosted on another server (or redirects to one, like a w3id.org id), that server does not allow browser (cross-origin) access. Download the file and upload it instead.'
      : errorMessage(err)
  } finally {
    shapesBusy.value = false
  }
}

// An attachment arriving without a shape count (crate import, edit re-open)
// gets one counted lazily, so the chip can say how many shapes it carries.
watch(
  () => builder.customShapesText,
  (text) => {
    const meta = builder.customShapesMeta
    if (!text.trim() || !meta || meta.shapeCount !== undefined) return
    void (async () => {
      try {
        const { liftShapes } = await import('@/lib/shacl/lift')
        const { shapeCount } = liftShapes(text)
        if (builder.customShapesText === text) builder.setCustomShapes(text, { ...meta, shapeCount })
      } catch {
        // Unparseable attachment from an imported crate: keep it verbatim, the
        // chip just shows no count.
      }
    })()
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-4">
    <Notice v-if="builder.needsToken" tone="warning">
      Add a bearer token in Settings before creating profiles.
    </Notice>

    <div>
      <h4 class="text-sm font-semibold text-foreground">Profile basics</h4>
      <p class="text-xs text-muted-foreground">Name the profile and choose the group that owns it. These describe the profile itself, not the metadata it validates.</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label class="text-xs font-medium text-foreground">Group</label>
        <GroupSelect v-model="builder.groupId" :options="builder.groupOptions" class="mt-1" placeholder="Choose a group" :disabled="locked" :invalid="fieldError('group') ? 'error' : undefined" />
        <p v-if="fieldError('group')" class="mt-1 text-[11px] text-destructive">{{ fieldError('group') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Name</label>
        <Input v-model="builder.name" class="mt-1" placeholder="Proteomics dataset Profile" :invalid="fieldError('name') ? 'error' : undefined" />
        <p v-if="fieldError('name')" class="mt-1 text-[11px] text-destructive">{{ fieldError('name') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Slug</label>
        <Input
          :model-value="builder.slug"
          class="mt-1"
          placeholder="proteomics"
          :disabled="locked"
          :invalid="fieldError('slug') ? 'error' : undefined"
          @update:model-value="(value: string | number) => builder.setSlug(value)"
        />
        <p class="mt-1 text-[11px] text-muted-foreground">
          <template v-if="locked">The stored path <code>profiles/{{ builder.slug }}</code> is fixed while editing.</template>
          <template v-else>Used in the profile path <code>profiles/{{ builder.slug || 'slug' }}</code>. Auto-filled from the name until you edit it.</template>
        </p>
        <p v-if="fieldError('slug')" class="mt-1 text-[11px] text-destructive">{{ fieldError('slug') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Version</label>
        <Input v-model="builder.version" class="mt-1" placeholder="0.1.0" :invalid="fieldError('version') ? 'error' : undefined" />
        <p v-if="fieldError('version')" class="mt-1 text-[11px] text-destructive">{{ fieldError('version') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Date published</label>
        <Input v-model="builder.datePublished" type="date" class="mt-1" :invalid="fieldError('datePublished') ? 'error' : undefined" />
        <p v-if="fieldError('datePublished')" class="mt-1 text-[11px] text-destructive">{{ fieldError('datePublished') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">License URL</label>
        <Input v-model="builder.license" class="mt-1" :invalid="fieldError('license') ? 'error' : undefined" />
        <p v-if="fieldError('license')" class="mt-1 text-[11px] text-destructive">{{ fieldError('license') }}</p>
      </div>
    </div>

    <div>
      <label class="text-xs font-medium text-foreground">Description</label>
      <Textarea v-model="builder.description" class="mt-1" rows="2" placeholder="What this profile is for and who should use it." :invalid="fieldError('description') ? 'error' : undefined" />
      <p v-if="fieldError('description')" class="mt-1 text-[11px] text-destructive">{{ fieldError('description') }}</p>
    </div>

    <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
      <span>
        Public profile
        <span class="block text-[11px] text-muted-foreground">Only public profiles are registered for dataset validation. A private profile is saved as a draft that datasets cannot reference.</span>
      </span>
      <Switch :checked="builder.isPublic" @update:checked="(value: boolean) => (builder.isPublic = value)" />
    </label>

    <!-- SHACL shapes (advanced): optional expert attachment, collapsed by default. -->
    <div class="rounded-md border border-border">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        :aria-expanded="shapesOpen"
        @click="shapesOpen = !shapesOpen"
      >
        <span class="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileCode2 class="h-4 w-4 text-primary" /> SHACL shapes (advanced)
          <Badge v-if="builder.customShapesMeta" variant="secondary">
            {{ builder.customShapesMeta.fileName }} · merged into shapes.ttl<template v-if="builder.customShapesMeta.shapeCount !== undefined"> · {{ builder.customShapesMeta.shapeCount }} {{ builder.customShapesMeta.shapeCount === 1 ? 'shape' : 'shapes' }}</template>
          </Badge>
        </span>
        <ChevronDown class="h-4 w-4 text-muted-foreground transition-transform" :class="shapesOpen ? 'rotate-180' : ''" />
      </button>
      <div v-if="shapesOpen" class="space-y-3 border-t border-border px-3 py-3">
        <p class="text-[11px] text-muted-foreground">
          Uploading SHACL shapes adds supported properties to the editable form rules. The original constraints are preserved in the same unified <code>shapes.ttl</code>, including constraints without a form equivalent.
        </p>

        <div v-if="builder.customShapesMeta" class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <FileCode2 class="h-3.5 w-3.5 shrink-0 text-primary" />
          <span class="font-medium text-foreground">{{ builder.customShapesMeta.fileName }}</span>
          <span v-if="builder.customShapesMeta.shapeCount !== undefined" class="text-muted-foreground">
            {{ builder.customShapesMeta.shapeCount }} {{ builder.customShapesMeta.shapeCount === 1 ? 'node shape' : 'node shapes' }}, valid Turtle
          </span>
          <span class="flex-1"></span>
          <Button type="button" variant="outline" size="sm" :disabled="shapesBusy" @click="shapesFileInput?.click()">Replace</Button>
          <Button type="button" variant="ghost" size="sm" @click="builder.clearCustomShapes()">
            <X class="size-3.5" /> Remove
          </Button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <input ref="shapesFileInput" type="file" accept=".ttl,text/turtle" class="hidden" @change="onShapesFile" />
          <Button v-if="!builder.customShapesMeta" type="button" variant="outline" size="sm" :disabled="shapesBusy" @click="shapesFileInput?.click()">
            <Upload class="size-3.5" /> Upload .ttl
          </Button>
          <span v-if="!builder.customShapesMeta" class="text-[11px] text-muted-foreground">or</span>
          <div class="flex min-w-[220px] flex-1 items-center gap-2">
            <Input v-model="shapesUrl" placeholder="https://…/shapes.ttl" @keydown.enter="shapesFromUrl" />
            <Button type="button" variant="outline" size="sm" :disabled="shapesBusy || !shapesUrl.trim()" @click="shapesFromUrl">
              <Spinner v-if="shapesBusy" class="text-current" aria-hidden="true" />
              <Globe v-else class="size-3.5" /> Fetch
            </Button>
          </div>
        </div>

        <p v-if="shapesError" class="text-[11px] text-destructive">{{ shapesError }}</p>
      </div>
    </div>
  </section>
</template>
