<script setup lang="ts">
// The login chooser: the configured logins, or the realm's plain sign-in, then another Aruna realm
// when this realm accepts logins from other realms.
import { computed, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import RealmPicker from '@/components/federation/RealmPicker.vue'
import LoginOptions from '@/components/auth/LoginOptions.vue'
import { signInChoice } from '@/composables/signInChoice'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { loginWithRealm } from '@/composables/useFederation'
import type { LoginOption } from '@/lib/config'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import { Globe2, RefreshCw } from '@lucide/vue'

const { signIn } = useAuth()
const { realm, realmInfo } = useAruna()
const router = useRouter()

const open = computed({
  get: () => signInChoice.value !== null,
  set: (value: boolean) => {
    if (!value) signInChoice.value = null
  },
})

function choose(choice: LoginOption) {
  const options = signInChoice.value
  if (!options) return
  signInChoice.value = null
  const params = Object.keys(choice.params).length ? choice.params : undefined
  const upstream = choice.upstream
  void signIn({ ...options, ...(params && { params }), ...(upstream && { upstream }) })
}

// Login with an account of another realm: a popup at that realm, then a session here.
// A backend without the field accepts none as far as the portal knows.
const accepted = computed(() => realmInfo.value?.accepted_realms ?? { mode: 'none' as const })
const acceptedIds = computed(() => (accepted.value.mode === 'only' ? accepted.value.realms : undefined))
const pickerOpen = ref(false)
const homeRealm = shallowRef<VerifiedRealm | null>(null)
const federating = ref(false)
const federationError = ref<string | null>(null)

function browsePublic() {
  signInChoice.value = null
  void router.push('/app/datasets')
}

async function loginElsewhere(home: VerifiedRealm) {
  const redirectTo = signInChoice.value?.redirectTo ?? '/app'
  homeRealm.value = home
  federating.value = true
  federationError.value = null
  const failure = await loginWithRealm(home, realm.value.name)
  federating.value = false
  if (homeRealm.value !== home) return
  federationError.value = failure
  if (failure) return
  signInChoice.value = null
  void router.push(redirectTo)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle class="text-center">Continue login with</DialogTitle>
        <DialogDescription class="sr-only">Choose how you want to sign in.</DialogDescription>
      </DialogHeader>
      <LoginOptions v-slot="{ rowClass }" @choose="choose">
        <li v-if="accepted.mode !== 'none'">
          <button
            type="button"
            title="Use your account of another Aruna realm"
            :class="rowClass"
            :aria-expanded="pickerOpen"
            :disabled="federating"
            @click="pickerOpen = !pickerOpen"
          >
            <span class="flex h-8 w-14 shrink-0 items-center justify-center">
              <Globe2 class="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <span class="w-44 text-left">Another Aruna realm</span>
          </button>
        </li>
      </LoginOptions>
      <div v-if="pickerOpen && !federating && accepted.mode !== 'none'" class="rounded-lg border border-border bg-muted/30 p-1">
        <RealmPicker
          action-label="Choose"
          :exclude-realm-id="realm.id"
          :only-realm-ids="acceptedIds"
          :check-pick="false"
          @pick="loginElsewhere"
        />
      </div>
      <Spinner v-if="federating && homeRealm" show-label :label="`Waiting for ${homeRealm.name}…`" class="text-xs" />
      <Notice v-if="federationError" tone="error" class="flex items-center justify-between gap-3">
        <span>{{ federationError }}</span>
        <Button v-if="homeRealm" size="sm" variant="outline" @click="loginElsewhere(homeRealm)">
          <RefreshCw class="h-3.5 w-3.5" /> Try again
        </Button>
      </Notice>
      <p class="text-xs leading-relaxed text-muted-foreground">
        New login with the email of an existing account? You sign in once with that account to link both.
      </p>
      <Button variant="ghost" size="sm" @click="browsePublic">Browse public data without login</Button>
    </DialogContent>
  </Dialog>
</template>
