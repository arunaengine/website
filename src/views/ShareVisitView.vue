<script setup lang="ts">
// The page a share link opens, for people without an account: the signed-out top bar with only
// Sign in, a password step when the link has one, then the files, the dataset or the upload area.
// Unknown, ended and revoked links all get the same answer.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { KeyRound, Link2Off, LogIn } from '@lucide/vue'
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import VisitDataset from '@/components/shares/VisitDataset.vue'
import VisitFiles from '@/components/shares/VisitFiles.vue'
import VisitUpload from '@/components/shares/VisitUpload.vue'
import { useAuth } from '@/composables/useAuth'
import { useShareVisit } from '@/composables/useShareVisit'
import { MODE_LABELS } from '@/lib/shareLinks'
import { formatDateTime } from '@/lib/utils'

const route = useRoute()
const { signIn } = useAuth()
const { phase, share, error, busy, start, open, visit } = useShareVisit()
const password = ref('')

onMounted(() => void start(String(route.params.node ?? '')))

const title = computed(() => share.value?.name || (share.value?.kind === 'dataset' ? 'Shared dataset' : 'Shared files'))
const uploadOnly = computed(() => share.value?.mode === 'upload')

function submitPassword() {
  if (password.value) void open(password.value)
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-background">
    <div class="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div class="flex h-14 w-full items-center gap-3 px-4 sm:px-6">
        <RouterLink to="/" aria-label="Aruna home"><AppLogo :size="22" /></RouterLink>
        <span class="flex-1"></span>
        <Button size="sm" class="h-9" aria-label="Sign in" @click="signIn({ redirectTo: '/app' })">
          <LogIn class="h-4 w-4" /> <span class="hidden min-[480px]:inline">Sign in</span>
        </Button>
      </div>
    </div>

    <main class="w-full flex-1 px-4 py-8 sm:px-6">
      <div v-if="phase === 'opening' && error" class="mx-auto max-w-sm space-y-3">
        <RefusalNote :message="error" />
        <Button variant="outline" :disabled="busy" @click="open()">Try again</Button>
      </div>
      <Spinner v-else-if="phase === 'opening'" label="Opening the link" />

      <EmptyState v-else-if="phase === 'broken'" title="This link does not work" description="It may have ended or been revoked. Ask the person who sent it for a new link.">
        <template #icon><Link2Off class="h-6 w-6" /></template>
      </EmptyState>

      <form v-else-if="phase === 'password'" class="surface mx-auto max-w-sm space-y-3 px-5 py-6" @submit.prevent="submitPassword">
        <h1 class="flex items-center gap-2 text-base font-semibold text-foreground"><KeyRound class="h-4 w-4 text-primary" /> This link has a password</h1>
        <div>
          <label for="share-visit-password" class="text-xs font-medium text-foreground">Password</label>
          <Input id="share-visit-password" v-model="password" type="password" autocomplete="current-password" class="mt-1" />
        </div>
        <RefusalNote v-if="error" :message="error" />
        <Button type="submit" class="w-full" :disabled="busy || !password">{{ busy ? 'Opening…' : 'Open' }}</Button>
      </form>

      <div v-else-if="share" class="space-y-6">
        <header class="space-y-2">
          <h1 class="break-words text-xl font-semibold text-foreground">{{ title }}</h1>
          <dl class="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div class="flex gap-1.5"><dt class="text-muted-foreground">Access</dt><dd class="text-foreground">{{ MODE_LABELS[share.mode] }}</dd></div>
            <div class="flex gap-1.5"><dt class="text-muted-foreground">Link expires</dt><dd class="text-foreground">{{ share.expires_at ? formatDateTime(share.expires_at) : 'No expiry' }}</dd></div>
          </dl>
        </header>
        <RefusalNote v-if="error" :message="error" />
        <VisitDataset v-if="share.kind === 'dataset'" :visit="visit" />
        <VisitUpload v-else-if="uploadOnly" :visit="visit" prefix="" upload-only />
        <VisitFiles v-else :visit="visit" :root-name="title" :uploads="share.mode === 'read_upload'" />
      </div>
    </main>
  </div>
</template>
