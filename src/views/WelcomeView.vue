<script setup lang="ts">
// Desktop first run (aruna notes, decision 13): the app starts with no realm,
// so it asks for one instead of enrolling. The shell validates the address,
// remembers it, and replaces this window against that realm's API — a success
// here ends in a reload, which is what the reconnecting panel stands for.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { validateRealm } from '@/lib/desktopBridge'
import { insecureRealm, pendingRealm, setPendingRealm } from '@/lib/desktopWelcome'
import { ArrowRight, KeyRound } from '@lucide/vue'

// Long enough that a working replacement is never called stalled.
const STALL_MS = 20_000

const router = useRouter()
const address = ref('')
// Courtesy only: the warning never blocks the shell's own validation.
const insecure = computed(() => insecureRealm(address.value))
const checking = ref(false)
const failure = ref<string | null>(null)
const connecting = ref<string | null>(null)
const interrupted = ref<string | null>(null)
const stalled = ref(false)

let stallTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  // Landing here with a connect on record means the window came back without
  // the realm; say so rather than showing an empty form again.
  interrupted.value = pendingRealm()
  if (interrupted.value) address.value = interrupted.value
  setPendingRealm(null)
})

async function connect(): Promise<void> {
  const input = address.value.trim()
  if (!input || checking.value) return
  checking.value = true
  failure.value = null
  interrupted.value = null
  try {
    const target = await validateRealm(input)
    connecting.value = target.origin
    setPendingRealm(target.origin)
    stallTimer = setTimeout(() => (stalled.value = true), STALL_MS)
  } catch (err) {
    // The shell classifies the failure; its wording is the whole answer.
    failure.value = err instanceof Error ? err.message : String(err)
  } finally {
    checking.value = false
  }
}

// The shell stores the realm before it reopens the window, so a replacement
// that never arrives leaves the address to try again rather than lost work.
function cancel(): void {
  clearTimeout(stallTimer)
  stalled.value = false
  connecting.value = null
  setPendingRealm(null)
}

onUnmounted(() => clearTimeout(stallTimer))

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
            class="pointer-events-none absolute -bottom-[60%] -right-[40%] w-[120%] max-w-none select-none opacity-[0.15] dark:opacity-[0.22]"
          />
          <div class="relative">
            <AppLogo :size="26" subtitle="the data orchestration engine" />
            <p class="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Aruna Desktop starts out empty. Name the realm you work in and the app opens its portal here.
            </p>
            <p class="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
              The node on this machine is enrolled later, from inside the realm, and only if you want it.
            </p>
          </div>
        </div>

        <div v-if="connecting" class="flex flex-col justify-center gap-2 p-6 md:p-7" aria-busy="true">
          <Spinner label="Reconnecting" />
          <p class="text-sm font-medium text-foreground">Reconnecting to {{ connecting }}</p>
          <p class="text-xs leading-relaxed text-muted-foreground">
            Aruna Desktop is reopening this window against the realm, which takes a moment.
          </p>
          <div v-if="stalled" class="pt-1">
            <p class="text-xs leading-relaxed text-muted-foreground">
              The window has not reopened. The app remembers this realm, so restarting it lands there — or name
              another address.
            </p>
            <Button variant="outline" size="sm" class="mt-2" @click="cancel">Back to the address</Button>
          </div>
        </div>

        <div v-else class="flex flex-col justify-center gap-4 p-6 md:p-7">
          <h1 class="font-display text-lg font-semibold tracking-tight text-aruna-navy">Connect to a realm</h1>

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
            <p class="mt-1 text-[11px] text-muted-foreground">
              A host name or the portal URL you were given; https:// is assumed.
            </p>
          </div>

          <p
            v-if="insecure"
            class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
          >
            This address uses plain http on a non-local host, and browser sign-in (PKCE) needs a secure context.
            Use https, or a localhost or tunnel address.
          </p>

          <p
            v-if="interrupted"
            class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          >
            The app was connecting to {{ interrupted }} when this window last closed. Try it again, or name another
            realm.
          </p>
          <p
            v-if="failure"
            class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {{ failure }}
          </p>

          <Button class="w-full" :disabled="!address.trim() || checking" @click="connect">
            {{ checking ? 'Checking…' : 'Connect' }} <ArrowRight class="h-4 w-4" />
          </Button>

          <div class="border-t border-border/70 pt-3">
            <Button variant="ghost" size="sm" class="-ml-2" @click="toEnroll">
              <KeyRound class="h-4 w-4" /> I have an enrollment code
            </Button>
            <p class="mt-1 text-[11px] text-muted-foreground">
              Enrolls the node on this machine from the code alone, without a realm address.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
