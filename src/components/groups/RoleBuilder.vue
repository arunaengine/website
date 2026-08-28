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
import { errorMessage } from '@/lib/utils'

// Composes a role as a list of access rules (path + level) and submits the
// whole permission map at once. Editing recreates the role with the same name,
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
    ? `Updated the existing access rule for ${updated.join(' and ')}, a role holds one access level per path.`
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
          errorMessage(err)
        }. Delete it from the list.`
        return
      }
    } else {
      await createGroupRole(props.group.group_id, { name: name.value.trim(), permissions })
    }
    emit('saved')
  } catch (err) {
    error.value = errorMessage(err)
  }
}
</script>

<template>
  <div>
    <div class="flex items-start justify-between gap-2 border-b border-border bg-muted/10 px-5 py-4">
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-foreground">
          {{ role ? `Edit role "${role.name}"` : 'New role' }}
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          A role is a named set of access rules. Name it, select what it covers, choose an access level, and
          add access rules, members holding the role get exactly what its rules allow.
        </p>
      </div>
      <Button variant="ghost" size="sm" class="shrink-0" @click="emit('cancel')"><X class="h-3.5 w-3.5" /> Close</Button>
    </div>

    <div class="grid gap-6 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div class="min-w-0">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</div>
        <div class="mt-1.5 max-w-sm">
          <label class="sr-only" for="role-name">Role name</label>
          <Input id="role-name" v-model="name" placeholder="e.g. curators" />
          <p v-if="nameReserved" class="mt-1 text-[11px] text-destructive">
            The names "admin" and "user" are reserved for built-in roles.
          </p>
        </div>

        <h3 class="mt-6 text-sm font-semibold text-foreground">Add access</h3>
        <PermissionPathPicker
          :group-id="group.group_id"
          :path-prefix="prefix"
          :selected="pending"
          class="mt-2"
          @select="(suffixes) => ((pending = suffixes), (notice = null))"
        />
        <!-- The rule row only exists once a scope is selected; before that a
             hint sits in its place instead of a disabled control cluster. -->
        <div v-if="pending.length" class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <Select
            :model-value="pendingLevel"
            :options="LEVEL_OPTIONS"
            aria-label="Access level"
            class="h-8 w-32 shrink-0 text-xs"
            @update:model-value="(value: string) => (pendingLevel = toLevel(value))"
          />
          <span class="min-w-0 flex-1 text-xs text-foreground">{{ pendingPreview }}</span>
          <Button variant="outline" size="sm" class="shrink-0" @click="commitPending">
            <Plus class="h-3.5 w-3.5" /> Add access rule
          </Button>
        </div>
        <p v-else class="mt-3 text-xs text-muted-foreground">
          Nothing selected yet, pick a scope or browse above to add an access rule.
        </p>
      </div>

      <div class="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <div class="rounded-lg border border-border bg-muted/10 p-4">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">
            {{ role?.public ? 'Everyone, including anonymous visitors, can' : 'Members with this role can' }}
          </h2>
          <p v-if="!grants.length" class="mt-1.5 text-xs text-muted-foreground">
            Add your first access rule, choose what members of this role can reach.
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
              <span class="min-w-0 flex-1 text-xs text-foreground" :title="`${prefix}${grant.suffix}`">
                {{ describeTarget(grant.suffix) }}
                <span v-if="grant.level === 'deny'" class="text-muted-foreground">(blocks any other access rule)</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0 text-muted-foreground"
                :aria-label="`Remove access rule for ${describeTarget(grant.suffix)}`"
                @click="removeGrant(index)"
              >
                <X class="h-3.5 w-3.5" />
              </Button>
            </li>
          </ul>
          <p v-if="notice" class="mt-1.5 text-[11px] text-muted-foreground">{{ notice }}</p>

          <div class="mt-4">
            <button
              type="button"
              class="flex w-full items-center gap-1 text-left text-xs font-medium text-foreground/80 hover:text-foreground"
              @click="showRaw = !showRaw"
            >
              <ChevronRight :class="['h-3.5 w-3.5 shrink-0 transition-transform', showRaw && 'rotate-90']" />
              Technical details
              <span class="text-[10px] font-normal text-muted-foreground">
                {{ grants.length }} {{ grants.length === 1 ? 'path' : 'paths' }}
              </span>
            </button>
            <div v-if="showRaw" class="mt-2 rounded-md border border-border bg-muted/20 p-3">
              <p class="break-all font-mono text-[10px] text-muted-foreground">{{ prefix }}</p>
              <ul v-if="grants.length" class="mt-1.5 space-y-0.5">
                <li v-for="grant in grants" :key="grant.suffix" class="flex items-center gap-2 font-mono text-[11px]">
                  <span class="min-w-0 truncate text-foreground/80" :title="`${prefix}${grant.suffix}`">{{ grant.suffix }}</span>
                  <span class="ml-auto shrink-0 uppercase text-muted-foreground">{{ grant.level }}</span>
                </li>
              </ul>
              <p v-else class="mt-1.5 font-mono text-[11px] text-muted-foreground">(no paths yet)</p>
              <div class="mt-2 flex items-center gap-2">
                <Input v-model="rawPath" class="h-8 font-mono text-xs" placeholder="data/** or meta/reports/**" @keydown.enter.prevent="commitRaw" />
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

          <div class="mt-4 flex items-center gap-2 border-t border-border/70 pt-3">
            <Button :disabled="!canSave" @click="submit">{{ role ? 'Save changes' : 'Create role' }}</Button>
            <Button variant="ghost" :disabled="saving" @click="emit('cancel')">Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
