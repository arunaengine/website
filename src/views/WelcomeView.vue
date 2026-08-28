<script setup lang="ts">
// Desktop first run (aruna notes, decision 13): the app starts with no realm,
// so it asks for one instead of enrolling. The shell validates the address,
// remembers it and switches this window's context to that realm; nothing is
// reopened, so the step just waits for the context and moves on.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { errorMessage } from '@/lib/utils'
import { validateRealm } from '@/lib/desktopBridge'
import { awaitRealm, insecureRealm } from '@/lib/desktopWelcome'
import { ArrowRight, KeyRound } from '@lucide/vue'

const router = useRouter()
const address = ref('')
// Courtesy only: the warning never blocks the shell's own validation.
const insecure = computed(() => insecureRealm(address.value))
const checking = ref(false)
const failure = ref<string | null>(null)
const connecting = ref<string | null>(null)

const action = computed(() => {
  if (connecting.value) return 'Connecting…'
  return checking.value ? 'Checking…' : 'Connect'
})

async function connect(): Promise<void> {
  const input = address.value.trim()
  if (!input || checking.value) return
  checking.value = true
  failure.value = null
  try {
    const target = await validateRealm(input)
    connecting.value = target.origin
    if (await awaitRealm(target.origin)) {
      // The shell may have followed the address to a management node; the
      // sign-in step says so, since the origin it shows is not the typed one.
      const query = target.redirectedFrom ? { from: target.redirectedFrom } : {}
      await router.replace({ name: 'welcome-sign-in', query })
      return
    }
    failure.value = `Aruna Desktop stored ${target.origin} but has not switched to it. Try again.`
  } catch (err) {
    // The shell classifies the failure; its wording is the whole answer.
    failure.value = errorMessage(err)
  } finally {
    checking.value = false
    connecting.value = null
  }
}

function toEnroll(): void {
  void router.push({ name: 'device', query: { tab: 'enroll' } })
}
</script>

<template>
  <div class="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
    <div
      aria-hidden="true"
      class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black_30%,transparent_75%)]"
    />
    <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />

    <div class="surface relative w-full max-w-3xl overflow-hidden">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aruna-aqua/60 to-transparent"
      />
      <div class="grid md:grid-cols-[0.95fr_1.05fr]">
        <!-- First impression: the brand column carries the lockup and what
             this window is for; the realm itself is still unknown here. -->
        <div class="relative overflow-hidden border-b border-border/70 p-6 md:border-b-0 md:border-r md:p-7">
          <div
            aria-hidden="true"
            class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_0%_0%,black_35%,transparent_80%)]"
          />
          <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />
          <!-- icon-mark.png pads the wave (alpha bbox 183,333–1118,870 of 1254 sq);
               oversized and cropped so it rises out of the panel's corner. -->
          <img
            src="/brand/icon-mark.png"
            alt=""
            draggable="false"
            class="pointer-events-none absolute -right-[40%] bottom-0 w-[120%] max-w-none translate-y-[55%] select-none opacity-[0.15] dark:opacity-[0.22]"
          />
          <div class="relative">
            <AppLogo :size="26" subtitle="the data orchestration engine" />
            <p class="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Your realm’s portal opens in this window.
            </p>
          </div>
        </div>

        <div class="flex flex-col justify-center gap-4 p-6 md:p-7">
          <h1 class="font-display text-lg font-semibold tracking-tight text-aruna-navy">Connect to your realm</h1>

          <div>
            <label class="text-xs font-medium text-foreground" for="realm-address">Realm address</label>
            <Input
              id="realm-address"
              v-model="address"
              class="mt-1"
              placeholder="aruna.example.org"
              :invalid="failure ? 'error' : insecure ? 'warning' : undefined"
              @keyup.enter="connect"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">https:// is assumed.</p>
          </div>

          <Notice v-if="insecure" tone="warning">
            This address uses plain http on a non-local host, and browser sign-in (PKCE) needs a secure context.
            Use https, or a localhost or tunnel address.
          </Notice>

          <p v-if="connecting" class="text-xs text-muted-foreground" aria-live="polite">
            Connecting to {{ connecting }}…
          </p>
          <Notice v-if="failure" tone="error">{{ failure }}</Notice>

          <Button class="w-full" :disabled="!address.trim() || checking" @click="connect">
            {{ action }} <ArrowRight class="h-4 w-4" />
          </Button>

          <div class="border-t border-border/70 pt-3">
            <Button variant="ghost" size="sm" class="-ml-2" @click="toEnroll">
              <KeyRound class="h-4 w-4" /> I have an enrollment code
            </Button>
            <p class="mt-1 text-[11px] text-muted-foreground">
              Enrolls this computer’s node from the code alone.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
