<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Pagination from '@/components/ui/Pagination.vue'
import NewProfileDialog from '@/components/metadata/NewProfileDialog.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { ListChecks, Plus, Star, Lock, CheckCircle2, Circle } from 'lucide-vue-next'
import type { ProfileFieldKind } from '@/data/types'

const route = useRoute()
const router = useRouter()
const { profiles, currentUser, updateUserProfile, saving } = useAruna()
const showNewProfile = ref(false)

const selectedId = computed(() => (route.params.profileId as string) || profiles.value[0]?.id || '')
const selected = computed(() => profiles.value.find((profile) => profile.id === selectedId.value))
const preferredId = computed(() => currentUser.value?.preferredProfileId ?? '')

function select(id: string) {
  router.push({ name: 'profile-detail', params: { profileId: id } })
}

async function setPreferred(id: string) {
  await updateUserProfile({ set_attributes: { 'ui.preferred_profile_path': `profiles/${id}` } })
}

const FIELD_PAGE_SIZE = 8
const fieldPage = ref(1)
watch(selectedId, () => {
  fieldPage.value = 1
})
const fieldsPaged = computed(() => selected.value?.fields.slice((fieldPage.value - 1) * FIELD_PAGE_SIZE, fieldPage.value * FIELD_PAGE_SIZE) ?? [])

const fieldKindLabel: Record<ProfileFieldKind, string> = {
  text: 'Single line',
  longtext: 'Long text',
  url: 'URL',
  date: 'Date',
  'keyword-list': 'Keywords',
  'person-list': 'People',
  license: 'License',
  enum: 'One of',
}
</script>

<template>
  <div>
    <PageHeader
      title="Metadata profiles"
      description="Profiles are ordinary RO-Crate metadata documents stored under profiles/."
    >
      <template #actions>
        <Button @click="showNewProfile = true" :disabled="!currentUser">
          <Plus class="h-4 w-4" /> New profile
        </Button>
      </template>
    </PageHeader>

    <div class="container grid max-w-[1400px] gap-6 py-8 lg:grid-cols-[360px_1fr]">
      <aside class="surface max-h-[80vh] overflow-y-auto scrollbar-thin">
        <ul v-if="profiles.length" class="divide-y divide-border">
          <li v-for="profile in profiles" :key="profile.id">
            <button
              type="button"
              class="flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              :class="selectedId === profile.id ? 'border-primary bg-primary/5' : 'border-transparent'"
              @click="select(profile.id)"
            >
              <div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" :style="{ backgroundColor: profile.iconColor }">
                <ListChecks class="h-4 w-4" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium text-foreground">{{ profile.name }}</span>
                  <Star v-if="preferredId === profile.id" class="h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" />
                  <Lock v-if="profile.managed" class="h-3 w-3 shrink-0 text-muted-foreground" title="Public profile" />
                </div>
                <div class="text-[11px] text-muted-foreground">{{ profile.domain }} · {{ profile.fields.length }} fields</div>
                <p class="mt-1 line-clamp-2 text-[11px] text-muted-foreground/90">{{ profile.description || 'No description in RO-Crate.' }}</p>
              </div>
            </button>
          </li>
        </ul>
        <div v-else class="p-8 text-center text-xs text-muted-foreground">
          No visible profile documents under <code>profiles/</code>.
        </div>
      </aside>

      <section v-if="selected" class="space-y-5">
        <div class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" :style="{ backgroundColor: selected.iconColor }">
                <ListChecks class="h-6 w-6" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>{{ selected.domain }}</span>
                  <span v-if="selected.managed" class="inline-flex items-center gap-1"><Lock class="h-3 w-3" /> public</span>
                </div>
                <h1 class="mt-1 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ selected.name }}</h1>
                <p class="mt-1 max-w-3xl text-sm text-muted-foreground">{{ selected.description || 'No description in RO-Crate.' }}</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button v-if="currentUser && preferredId !== selected.id" variant="outline" size="sm" :disabled="saving" @click="setPreferred(selected.id)">
                <Star class="h-3.5 w-3.5" /> Set as my default
              </Button>
              <Badge v-else-if="preferredId === selected.id" variant="accent" class="inline-flex items-center gap-1 px-2 py-1 text-[11px]">
                <Star class="h-3 w-3" fill="currentColor" /> Your default
              </Badge>
            </div>
          </div>

          <div class="mt-5 grid gap-3 md:grid-cols-3">
            <div class="surface-muted p-3">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Required fields</div>
              <div class="mt-1 font-display text-lg font-semibold text-aruna-navy">
                {{ selected.fields.filter((field) => field.required).length }}
                <span class="text-sm font-normal text-muted-foreground">/ {{ selected.fields.length }} total</span>
              </div>
            </div>
            <div class="surface-muted p-3">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Used by</div>
              <div class="mt-1 font-display text-lg font-semibold text-aruna-navy">{{ selected.usedCount }} <span class="text-sm font-normal text-muted-foreground">metadata docs</span></div>
            </div>
            <div class="surface-muted p-3">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Suggested keywords</div>
              <div class="mt-1 flex flex-wrap gap-1">
                <span v-for="keyword in selected.suggestedKeywords" :key="keyword" class="rounded-full bg-card px-2 py-0.5 text-[10px] text-foreground/70">#{{ keyword }}</span>
                <span v-if="!selected.suggestedKeywords.length" class="text-xs text-muted-foreground">None</span>
              </div>
            </div>
          </div>
        </div>

        <div class="surface overflow-hidden">
          <header class="border-b border-border px-5 py-3">
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Validator fields</h3>
            <p class="text-xs text-muted-foreground">Parsed from the profile RO-Crate JSON Schema validator entity.</p>
          </header>
          <ul class="divide-y divide-border">
            <li v-for="field in fieldsPaged" :key="field.id" class="flex items-start gap-3 px-5 py-3">
              <CheckCircle2 v-if="field.required" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <Circle v-else class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-foreground">{{ field.label }}</span>
                  <Badge :variant="field.required ? 'accent' : 'secondary'" class="text-[10px] uppercase">{{ field.required ? 'required' : 'optional' }}</Badge>
                  <span class="text-[10px] text-muted-foreground">· {{ fieldKindLabel[field.kind] }}</span>
                </div>
                <p class="mt-0.5 text-[12px] text-muted-foreground">{{ field.description }}</p>
                <div v-if="field.example" class="mt-1 font-mono text-[11px] text-foreground/60">e.g. {{ field.example }}</div>
              </div>
            </li>
            <li v-if="!selected.fields.length" class="px-5 py-8 text-center text-xs text-muted-foreground">
              This profile has no parseable JSON Schema fields.
            </li>
          </ul>
          <Pagination v-if="selected.fields.length > FIELD_PAGE_SIZE" v-model:page="fieldPage" :page-size="FIELD_PAGE_SIZE" :total="selected.fields.length" label="fields" />
        </div>
      </section>

      <section v-else class="surface p-10 text-center text-sm text-muted-foreground">
        Select a visible profile document.
      </section>
    </div>

    <NewProfileDialog v-model:open="showNewProfile" @created="(profile) => router.push({ name: 'profile-detail', params: { profileId: profile.id } })" />
  </div>
</template>
