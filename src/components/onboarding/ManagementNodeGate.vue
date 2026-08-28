<script setup lang="ts">
// Only a management node redeems an enrollment, so only it may mint one. On
// the web the owner opens the portal there; inside Aruna Desktop the app moves
// to the first one on its own, which drops the session and asks for a sign-in
// there. The owner only has to act when that move fails.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import { useAruna } from '@/composables/useAruna'
import { isDesktop } from '@/lib/desktop'
import { normalizeSeedUrl } from '@/lib/onboarding-config'
import { ArrowRightLeft, ExternalLink, LoaderCircle, ServerCrash } from '@lucide/vue'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ portals: Array<{ id: string; url: string }> }>()

const { apiBaseUrl } = useAruna()
const inDesktop = isDesktop()
const origin = computed(() => normalizeSeedUrl(apiBaseUrl.value))
const switching = ref<string | null>(null)
const failure = ref<string | null>(null)

async function switchTo(url: string): Promise<void> {
  if (switching.value) return
  switching.value = url
  failure.value = null
  try {
    const { validateRealm } = await import('@/lib/desktopBridge')
    const { awaitRealm } = await import('@/lib/desktopWelcome')
    const target = await validateRealm(url)
    if (!(await awaitRealm(target.origin))) {
      failure.value = `Aruna Desktop stored ${target.origin} but has not switched to it. Try again.`
    }
  } catch (err) {
    failure.value = errorMessage(err)
  } finally {
    switching.value = null
  }
}

// One move per mount: the realm info may name the nodes a moment after the
// gate shows, and a failed move is retried by the owner, not in a loop.
let moved = false
watch(
  () => props.portals[0]?.url,
  (url) => {
    if (!inDesktop || !url || moved) return
    moved = true
    void switchTo(url)
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex items-start gap-3">
    <ServerCrash class="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground/70" />
    <div class="min-w-0 flex-1">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">This node does not enroll devices</h3>
      <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
        Only a management node mints and redeems enrollments, and
        <span class="break-all font-mono text-foreground">{{ origin }}</span> is not one.
      </p>

      <p v-if="!portals.length" class="mt-3 text-xs leading-relaxed text-muted-foreground">
        {{
          inDesktop
            ? 'Connect Aruna Desktop to a management node instead. A realm administrator knows its address.'
            : 'A realm administrator knows the address of a management portal.'
        }}
      </p>

      <template v-else-if="inDesktop">
        <p v-if="switching" class="mt-3 flex items-center gap-2 text-xs text-foreground" aria-live="polite">
          <LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>
            Switching Aruna Desktop to
            <span class="break-all font-mono">{{ switching }}</span>
          </span>
        </p>
        <template v-else>
          <RefusalNote v-if="failure" :message="failure" class="mt-3" />
          <Button size="sm" variant="outline" class="mt-3" @click="switchTo(portals[0].url)">
            <ArrowRightLeft class="h-3.5 w-3.5" /> Switch to {{ portals[0].url }}
          </Button>
        </template>
        <p class="mt-2 text-[11px] text-muted-foreground">
          Switching ends this session; sign in again on the management node.
        </p>
      </template>

      <template v-else>
        <p class="mt-3 text-xs font-medium text-foreground">Open the portal on a management node</p>
        <ul class="mt-2 space-y-2">
          <li v-for="portal in portals" :key="portal.id" class="flex items-center justify-between gap-3">
            <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ portal.url }}</span>
            <a
              :href="portal.url"
              target="_blank"
              rel="noopener noreferrer"
              class="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink class="h-3.5 w-3.5" /> Open
            </a>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
