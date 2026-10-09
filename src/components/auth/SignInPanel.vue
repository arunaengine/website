<script setup lang="ts">
// The guest gate into a realm. Sign-in is one OIDC redirect, so the panel is
// a branded frame around that action plus the first-admin secret path.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import RealmPicker from '@/components/federation/RealmPicker.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { loginWithRealm } from '@/composables/useFederation'
import type { VerifiedRealm } from '@/lib/federation/descriptor'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { featureEnabled } from '@/lib/config'
import iconMark from '@/assets/brand/icon-mark.avif'
import { ChevronRight, LogIn, RefreshCw } from '@lucide/vue'

const { realm, realmInfo } = useAruna()
const { signIn, stage, stageError } = useAuth()

const secretOpen = ref(false)
const onboardingSecret = ref('')
const signingIn = computed(() => stage.value === 'redirecting')
const publicOverview = computed(() => realmInfo.value?.public_overview)

// Aruna Desktop signs in through a window of its own; an older shell hands
// the redirect to the system browser (RFC 8252).
const signInHint = featureEnabled('embeddedAuth')
  ? 'Sign-in opens in a window of this app at the realm’s identity provider, then returns here.'
  : featureEnabled('systemBrowserAuth')
    ? 'Sign-in opens in your browser at the realm’s identity provider, then returns to the app.'
    : 'Sign-in continues at the realm’s identity provider, then returns here.'

// Login with an account of another realm: a popup at that realm, then a session here.
const router = useRouter()
const pickerOpen = ref(false)
const homeRealm = ref<VerifiedRealm | null>(null)
const federating = ref(false)
const federationError = ref<string | null>(null)

async function loginElsewhere(home: VerifiedRealm) {
  homeRealm.value = home
  federating.value = true
  federationError.value = null
  const failure = await loginWithRealm(home, realm.value.name)
  federating.value = false
  if (homeRealm.value !== home) return
  federationError.value = failure
  if (!failure) void router.push('/app')
}

function startSignIn() {
  void signIn({ onboardingSecret: onboardingSecret.value, redirectTo: '/app' })
}
</script>

<template>
  <section aria-labelledby="signin-realm-name" class="surface relative overflow-hidden">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aruna-aqua/60 to-transparent"
    />
    <div class="grid md:grid-cols-[1.1fr_1fr]">
      <!-- The realm the visitor is about to enter. -->
      <div class="relative overflow-hidden border-b border-border/70 p-6 md:border-b-0 md:border-r md:p-7">
        <div
          aria-hidden="true"
          class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_0%_0%,black_35%,transparent_80%)]"
        />
        <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />
        <!-- The padded icon is oversized and cropped out of the panel's corner. -->
        <img
          :src="iconMark"
          alt=""
          draggable="false"
          class="pointer-events-none absolute -bottom-[56%] -right-[24%] w-[80%] max-w-none select-none opacity-[0.15] dark:opacity-[0.22] md:w-[64%]"
        />
        <div class="relative">
          <p class="eyebrow">Realm</p>
          <h2 id="signin-realm-name" class="mt-2 font-display text-xl font-semibold tracking-tight text-aruna-navy">
            {{ realm.name }}
          </h2>
          <p
            v-if="realm.description && realm.description !== realm.name"
            class="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground"
          >
            {{ realm.description }}
          </p>
          <p v-else-if="!realm.description" class="mt-1.5 text-sm text-muted-foreground">
            This realm has no description yet.
          </p>
          <p class="hash mt-3 break-all">{{ realm.id }}</p>
          <p v-if="!publicOverview" class="mt-3 text-xs text-muted-foreground">
            Public counts are unavailable from this node. Sign in for authenticated realm details.
          </p>
        </div>
      </div>

      <div class="flex flex-col justify-center gap-4 p-6 md:p-7">
        <div>
          <h3 class="font-display text-base font-semibold text-foreground">Sign in</h3>
          <p class="mt-1 text-sm leading-relaxed text-muted-foreground">{{ signInHint }}</p>
        </div>
        <Button class="w-full sm:w-auto sm:self-start" :disabled="signingIn" @click="startSignIn">
          <LogIn class="h-4 w-4" /> {{ signingIn ? 'Opening sign-in…' : 'Sign in' }}
        </Button>
        <Notice v-if="stageError" tone="error">{{ stageError }}</Notice>
        <div class="flex items-center gap-2.5 text-[11px] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or</div>
        <Button
          variant="outline"
          class="w-full sm:w-auto sm:self-start"
          :aria-expanded="pickerOpen"
          :disabled="federating"
          @click="pickerOpen = !pickerOpen"
        >
          Log in with another realm
        </Button>
        <div v-if="pickerOpen && !federating" class="rounded-lg border border-border bg-muted/30 p-1">
          <RealmPicker action-label="Choose" :exclude-realm-id="realm.id" @pick="loginElsewhere" />
        </div>
        <Spinner v-if="federating && homeRealm" show-label :label="`Waiting for ${homeRealm.name}…`" class="text-xs" />
        <Notice v-if="federationError" tone="error" class="flex items-center justify-between gap-3">
          <span>{{ federationError }}</span>
          <Button v-if="homeRealm" size="sm" variant="outline" @click="loginElsewhere(homeRealm)">
            <RefreshCw class="h-3.5 w-3.5" /> Try again
          </Button>
        </Notice>
        <div class="border-t border-border/70 pt-3">
          <button
            type="button"
            class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            :aria-expanded="secretOpen"
            @click="secretOpen = !secretOpen"
          >
            <ChevronRight :class="['h-3.5 w-3.5 transition-transform', secretOpen && 'rotate-90']" />
            First user on a fresh realm?
          </button>
          <div v-if="secretOpen" class="mt-3">
            <label class="text-xs font-medium text-foreground" for="signin-onboarding-secret">Onboarding secret</label>
            <Input
              id="signin-onboarding-secret"
              v-model="onboardingSecret"
              type="password"
              class="mt-1"
              placeholder="Paste onboarding secret"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Claims the realm admin role for the first account. Applied when you sign in.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
