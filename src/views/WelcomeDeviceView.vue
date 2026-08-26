<script setup lang="ts">
// Desktop first run, after sign-in: the node this machine runs is offered once
// and may be skipped. Setting up mints an enrollment against the realm and
// redeems it here; the shell restarts the node and switches this window's
// context underneath the step, which keeps watching across it.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import ClaimWatchStep from '@/components/onboarding/ClaimWatchStep.vue'
import ManagementNodeGate from '@/components/onboarding/ManagementNodeGate.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceSetup } from '@/composables/useDeviceSetup'
import { managementPortals } from '@/lib/onboarding-config'
import { ArrowRight, Laptop } from '@lucide/vue'

const router = useRouter()
const { realm, nodeInfo, isManagementNode, realmInfo } = useAruna()
const { applying, error, watching, joined, stages, state, apply, done } = useDeviceSetup()
const deviceName = ref('')

// Only a management node mints an enrollment. The node kind is answered to a
// realm token alone, so a node that has not said what it is does not gate.
const wrongNode = computed(() => nodeInfo.value?.node.capabilities != null && !isManagementNode.value)
const portals = computed(() => managementPortals(realmInfo.value?.nodes ?? []))

// A joined device has nothing left to watch, so the portal opens on its own.
watch(joined, (yes) => {
  if (yes) leave()
})

function leave(): void {
  done()
  void router.replace({ name: 'dashboard' })
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
        <div class="relative overflow-hidden border-b border-border/70 p-6 md:border-b-0 md:border-r md:p-7">
          <div
            aria-hidden="true"
            class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_0%_0%,black_35%,transparent_80%)]"
          />
          <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />
          <img
            src="/brand/icon-mark.png"
            alt=""
            draggable="false"
            class="pointer-events-none absolute -bottom-[60%] -right-[40%] w-[120%] max-w-none select-none opacity-[0.15] dark:opacity-[0.22]"
          />
          <div class="relative">
            <AppLogo :size="26" subtitle="the data orchestration engine" />
            <p class="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Aruna Desktop runs a node of your own on this machine. It joins {{ realm.name }} as your device: it
              never stores replicas for other members and never routes their data.
            </p>
          </div>
        </div>

        <div v-if="watching" class="flex flex-col justify-center gap-4 p-6 md:p-7">
          <h1 class="font-display text-lg font-semibold tracking-tight text-aruna-navy">Joining the realm</h1>
          <p class="text-xs leading-relaxed text-muted-foreground">
            The app restarts the node with its new identity; this window stays where it is while it joins.
          </p>
          <ClaimWatchStep :stages="stages" :error="state.lastError">
            <template #actions>
              <Button variant="outline" size="sm" @click="leave">Continue <ArrowRight class="h-4 w-4" /></Button>
            </template>
          </ClaimWatchStep>
        </div>

        <div v-else class="flex flex-col justify-center gap-4 p-6 md:p-7">
          <ManagementNodeGate v-if="wrongNode" :portals="portals" />

          <template v-else>
            <h1 class="font-display text-lg font-semibold tracking-tight text-aruna-navy">Set up this device</h1>

            <div>
              <label class="text-xs font-medium text-foreground" for="setup-device-name">Device name</label>
              <Input id="setup-device-name" v-model="deviceName" class="mt-1" placeholder="work-laptop" />
              <p class="mt-1 text-[11px] text-muted-foreground">
                Optional, and only how the realm lists this device. Where it stores data is yours to change later
                under This device.
              </p>
            </div>

            <RefusalNote v-if="error" :message="error" />

            <Button class="w-full" :disabled="applying" @click="apply(deviceName.trim())">
              <Laptop class="h-4 w-4" /> {{ applying ? 'Setting up…' : 'Set up this device' }}
            </Button>
          </template>

          <div class="border-t border-border/70 pt-3">
            <Button variant="ghost" size="sm" class="-ml-2" @click="leave">Skip for now</Button>
            <p class="mt-1 text-[11px] text-muted-foreground">
              The portal opens without a node of your own. This device is set up later under This device → Enroll.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
