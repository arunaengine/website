<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Plus, X } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import PermissionPathPicker from './PermissionPathPicker.vue'
import { describeTarget } from './permission-paths'
import { useAruna } from '@/composables/useAruna'
import type { ApiRole, GroupDetailResponse, GroupPermissionLevel } from '@/lib/api'

// Composes a role as a list of grants (path + level) and submits the whole
// permission map at once. Editing recreates the role with the same name,
// members and public flag, then removes the old one (there is no update API).
const props = defineProps<{
  group: GroupDetailResponse
  role?: ApiRole | null
}>()

const emit = defineEmits<{ (e: 'saved'): void; (e: 'cancel'): void }>()

const { createGroupRole, deleteGroupRole, saving } = useAruna()

const prefix = computed(() => `/${props.group.realm_id}/g/${props.group.group_id}/`)

interface Grant {
  suffix: string
  level: GroupPermissionLevel
}

function toLevel(value: string): GroupPermissionLevel {
  const lower = value.toLowerCase()
  return lower === 'write' || lower === 'deny' ? lower : 'read'
}

function initialGrants(): Grant[] {
  if (!props.role) return []
  return Object.entries(props.role.permissions).map(([path, level]) => ({
    suffix: path.startsWith(prefix.value) ? path.slice(prefix.value.length) : path,
    level: toLevel(level),
  }))
}

const name = ref(props.role?.name ?? '')
const grants = ref<Grant[]>(initialGrants())
const pending = ref<string[]>([])
const pendingLevel = ref<GroupPermissionLevel>('read')
const notice = ref<string | null>(null)
const error = ref<string | null>(null)
const showRaw = ref(false)
const rawPath = ref('')
const rawLevel = ref<GroupPermissionLevel>('read')

// Sentence-style level labels so each grant row reads as a summary line.
const LEVEL_OPTIONS = [
  { value: 'read', label: 'view' },
  { value: 'write', label: 'view & edit' },
  { value: 'deny', label: 'block' },
]

const RESERVED_NAMES = ['admin', 'user']
const nameReserved = computed(() => RESERVED_NAMES.includes(name.value.trim()))
const canSave = computed(() => !!name.value.trim() && !nameReserved.value && grants.value.length > 0 && !saving.value)

const pendingPreview = computed(() => pending.value.map(describeTarget).join(' and '))

// The permission map holds one level per path, so re-adding a path updates it.
function addGrants(suffixes: string[], level: GroupPermissionLevel) {
  const updated: string[] = []
  for (const raw of suffixes) {
    const suffix = raw.trim().replace(/^\/+/, '')
    if (!suffix) continue
    const existing = grants.value.find((grant) => grant.suffix === suffix)
    if (existing) {
      existing.level = level
      updated.push(describeTarget(suffix))
    } else {
      grants.value.push({ suffix, level })
    }
  }
  notice.value = updated.length
    ? `Updated the existing grant for ${updated.join(' and ')} — a role holds one access level per path.`
    : null
}

function commitPending() {
  if (!pending.value.length) return
  addGrants(pending.value, pendingLevel.value)
  pending.value = []
}

function commitRaw() {
  const suffix = rawPath.value.trim().replace(/^\/+/, '')
  if (!suffix) return
  addGrants([suffix], rawLevel.value)
  rawPath.value = ''
}

function removeGrant(index: number) {
  grants.value.splice(index, 1)
  notice.value = null
}

async function submit() {
  if (!canSave.value) return
  error.value = null
  const permissions: Record<string, GroupPermissionLevel> = {}
  for (const grant of grants.value) permissions[`${prefix.value}${grant.suffix}`] = grant.level
  try {
    if (props.role) {
      await createGroupRole(props.group.group_id, {
        name: name.value.trim(),
        permissions,
        assigned_users: props.role.assigned_users ?? [],
        public: props.role.public,
      })
      try {
        await deleteGroupRole(props.group.group_id, props.role.role_id)
      } catch (err) {
        error.value = `The updated role was created, but the previous "${props.role.name}" could not be removed: ${
          err instanceof Error ? err.message : String(err)
        }. Delete it from the list.`
        return
      }
    } else {
      await createGroupRole(props.group.group_id, { name: name.value.trim(), permissions })
    }
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="rounded-lg border border-border bg-background p-4">
    <div class="flex items-center justify-between gap-2">
      <div class="text-xs font-semibold text-foreground">
        {{ role ? `Edit role "${role.name}"` : 'New role' }}
      </div>
      <Button variant="ghost" size="sm" @click="emit('cancel')"><X class="h-3.5 w-3.5" /> Close</Button>
    </div>

    <div class="mt-3 max-w-xs">
      <label class="text-[11px] font-medium text-muted-foreground" for="role-name">Role name</label>
      <Input id="role-name" v-model="name" class="mt-1" placeholder="e.g. curators" />
      <p v-if="nameReserved" class="mt-1 text-[11px] text-destructive">
        The names "admin" and "user" are reserved for built-in roles.
      </p>
    </div>

    <div class="mt-4">
      <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {{ role?.public ? 'Everyone — including anonymous visitors — can' : 'Members with this role can' }}
      </div>
      <p v-if="!grants.length" class="mt-1.5 text-xs text-muted-foreground">
        Nothing yet — pick what this role should cover below.
      </p>
      <ul v-else class="mt-1.5 space-y-1">
        <li v-for="(grant, index) in grants" :key="grant.suffix" class="flex items-center gap-2">
          <Select
            :model-value="grant.level"
            :options="LEVEL_OPTIONS"
            aria-label="Access level"
            class="h-8 w-32 shrink-0 text-xs"
            @update:model-value="(value: string) => (grant.level = toLevel(value))"
          />
          <span class="min-w-0 text-xs text-foreground">
            {{ describeTarget(grant.suffix) }}
            <span v-if="grant.level === 'deny'" class="text-muted-foreground">(blocks any other grant)</span>
          </span>
          <span class="hidden min-w-0 truncate font-mono text-[10px] text-muted-foreground sm:inline">{{ grant.suffix }}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            class="ml-auto shrink-0 text-muted-foreground"
            :aria-label="`Remove grant ${grant.suffix}`"
            @click="removeGrant(index)"
          >
            <X class="h-3.5 w-3.5" />
          </Button>
        </li>
      </ul>
      <p v-if="notice" class="mt-1.5 text-[11px] text-muted-foreground">{{ notice }}</p>
    </div>

    <div class="mt-4">
      <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add access</div>
      <PermissionPathPicker
        :group-id="group.group_id"
        :path-prefix="prefix"
        :selected="pending"
        class="mt-1.5 max-w-xl"
        @select="(suffixes) => ((pending = suffixes), (notice = null))"
      />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Select
          :model-value="pendingLevel"
          :options="LEVEL_OPTIONS"
          aria-label="Access level"
          class="h-8 w-32 shrink-0 text-xs"
          @update:model-value="(value: string) => (pendingLevel = toLevel(value))"
        />
        <span class="min-w-0 flex-1 text-xs" :class="pending.length ? 'text-foreground' : 'text-muted-foreground'">
          {{ pending.length ? pendingPreview : 'Nothing selected yet — pick a scope or browse above.' }}
        </span>
        <Button variant="outline" size="sm" class="shrink-0" :disabled="!pending.length" @click="commitPending">
          <Plus class="h-3.5 w-3.5" /> Add grant
        </Button>
      </div>
    </div>

    <div class="mt-4">
      <button
        type="button"
        class="flex w-full items-center gap-1 text-left text-xs font-medium text-foreground/80 hover:text-foreground"
        @click="showRaw = !showRaw"
      >
        <ChevronRight :class="['h-3.5 w-3.5 shrink-0 transition-transform', showRaw && 'rotate-90']" />
        Technical details
        <span class="min-w-0 truncate font-mono text-[10px] font-normal text-muted-foreground">
          {{ prefix }}… · {{ grants.length }} {{ grants.length === 1 ? 'path' : 'paths' }}
        </span>
      </button>
      <div v-if="showRaw" class="mt-2 rounded-md border border-border bg-muted/20 p-3">
        <ul v-if="grants.length" class="space-y-0.5">
          <li v-for="grant in grants" :key="grant.suffix" class="flex items-center gap-2 font-mono text-[11px]">
            <span class="min-w-0 truncate text-foreground/80">{{ prefix }}{{ grant.suffix }}</span>
            <span class="shrink-0 uppercase text-muted-foreground">{{ grant.level }}</span>
          </li>
        </ul>
        <p v-else class="font-mono text-[11px] text-muted-foreground">(no paths yet)</p>
        <div class="mt-2 flex items-center gap-2">
          <span class="hidden max-w-[35%] shrink-0 truncate font-mono text-[10px] text-muted-foreground sm:inline" :title="prefix">{{ prefix }}</span>
          <Input v-model="rawPath" class="h-8 text-xs" placeholder="data/** or meta/reports/**" @keydown.enter.prevent="commitRaw" />
          <Select
            :model-value="rawLevel"
            :options="LEVEL_OPTIONS"
            aria-label="Access level"
            class="h-8 w-32 shrink-0 text-xs"
            @update:model-value="(value: string) => (rawLevel = toLevel(value))"
          />
          <Button variant="outline" size="sm" class="shrink-0" :disabled="!rawPath.trim()" @click="commitRaw">Add</Button>
        </div>
        <p class="mt-1.5 text-[11px] text-muted-foreground">
          Paths are relative to this group; a trailing ** covers everything below the path.
        </p>
      </div>
    </div>

    <p v-if="error" class="mt-3 text-xs text-destructive">{{ error }}</p>
    <p v-if="role" class="mt-3 text-[11px] text-muted-foreground">
      Saving replaces the role with an updated copy; assigned members keep it.
    </p>

    <div class="mt-3 flex items-center gap-2">
      <Button :disabled="!canSave" @click="submit">{{ role ? 'Save changes' : 'Create role' }}</Button>
      <Button variant="ghost" :disabled="saving" @click="emit('cancel')">Cancel</Button>
    </div>
  </div>
</template>
