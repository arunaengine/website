<script setup lang="ts">
// The consent card at the home realm: who logs in where, and what the other realm gets.
import Avatar from '@/components/ui/Avatar.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import RealmTag from '@/components/federation/RealmTag.vue'
import type { User } from '@/data/types'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import { ArrowRight, Check, KeyRound, UserRound } from '@lucide/vue'

defineProps<{
  home: { realmId: string; name: string }
  serving: VerifiedRealm
  user: User
  busy: boolean
  linking?: boolean
}>()
const emit = defineEmits<{ (e: 'allow'): void; (e: 'cancel'): void }>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="font-display text-lg font-semibold text-foreground">
      {{ linking ? `Link this account at ${serving.name}?` : `Log in to ${serving.name} as ${user.name}?` }}
    </h1>
    <div class="flex items-center gap-2">
      <RealmTag :realm-id="home.realmId" :name="home.name" />
      <ArrowRight class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <RealmTag :realm-id="serving.realmId" :name="serving.name" />
    </div>
    <p class="-mt-2 break-all font-mono text-[11px] text-muted-foreground">{{ serving.portalUrl }}</p>
    <div class="flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2">
      <Avatar :user="user" size="md" />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-foreground">{{ user.name }}</p>
        <p class="truncate font-mono text-[11px] text-muted-foreground" :title="user.id">{{ user.id }}</p>
      </div>
    </div>
    <div>
      <p class="text-xs font-semibold text-foreground">{{ serving.name }} will get</p>
      <ul class="mt-2 grid gap-2 text-sm">
        <li class="flex items-center gap-2.5"><UserRound class="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Your name</li>
        <li class="flex items-center gap-2.5"><KeyRound class="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Your account id</li>
        <li class="flex items-center gap-2.5 text-muted-foreground"><Check class="h-4 w-4 text-emerald-600" aria-hidden="true" /> Your password is not shared.</li>
        <li class="flex items-center gap-2.5 text-muted-foreground"><Check class="h-4 w-4 text-emerald-600" aria-hidden="true" /> This gives no access to {{ home.name }}.</li>
      </ul>
    </div>
    <Notice>Only allow this if you trust {{ serving.name }}.</Notice>
    <div class="flex gap-2">
      <Button variant="outline" class="flex-1" :disabled="busy" @click="emit('cancel')">Cancel</Button>
      <Button class="flex-1" :disabled="busy" @click="emit('allow')">
        <Spinner v-if="busy" class="text-current" aria-hidden="true" /> Allow
      </Button>
    </div>
  </div>
</template>
