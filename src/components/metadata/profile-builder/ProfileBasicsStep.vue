<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import type { ProfileBuilder } from './useProfileBuilder'

const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder

// Inline error per basics input, from the same field-keyed validation that
// gates the step's Next button (basicsFieldErrors), so the two never drift.
function fieldError(fieldId: string): string {
  return builder.basicsFieldErrors.find((error) => error.fieldId === fieldId)?.message ?? ''
}
</script>

<template>
  <section class="space-y-4">
    <div v-if="builder.needsToken" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      Add a bearer token in Settings before creating profiles.
    </div>

    <div>
      <h4 class="text-sm font-semibold text-foreground">Profile basics</h4>
      <p class="text-xs text-muted-foreground">Name the profile and choose the group that owns it. These describe the profile itself, not the metadata it validates.</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label class="text-xs font-medium text-foreground">Group</label>
        <Select v-model="builder.groupId" :options="builder.groupOptions" class="mt-1" placeholder="Choose a group" :invalid="fieldError('group') ? 'error' : undefined" />
        <p v-if="fieldError('group')" class="mt-1 text-[11px] text-destructive">{{ fieldError('group') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Name</label>
        <Input v-model="builder.name" class="mt-1" placeholder="Proteomics Dataset Profile" :invalid="fieldError('name') ? 'error' : undefined" />
        <p v-if="fieldError('name')" class="mt-1 text-[11px] text-destructive">{{ fieldError('name') }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Slug</label>
        <Input
          :model-value="builder.slug"
          class="mt-1"
          placeholder="proteomics"
          :invalid="fieldError('slug') ? 'error' : undefined"
          @update:model-value="(value: string | number) => builder.setSlug(value)"
        />
        <p class="mt-1 text-[11px] text-muted-foreground">Used in the profile path <code>profiles/{{ builder.slug || 'slug' }}</code>. Auto-filled from the name until you edit it.</p>
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
        <span class="block text-[11px] text-muted-foreground">Public profiles are discoverable without a bearer token.</span>
      </span>
      <Switch :checked="builder.isPublic" @update:checked="(value: boolean) => (builder.isPublic = value)" />
    </label>
  </section>
</template>
