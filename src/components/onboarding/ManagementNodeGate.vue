<script setup lang="ts">
// Only a management node redeems an enrollment, so only it may mint one. On
// the web the owner opens the portal there; inside Aruna Desktop the app moves
// to that node itself, which drops the session and asks for a sign-in there.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { isDesktop } from '@/lib/desktop'
import { normalizeSeedUrl } from '@/lib/onboarding-config'
import { ArrowRightLeft, ExternalLink, ServerCrash } from '@lucide/vue'

defineProps<{ portals: Array<{ id: string; url: string }> }>()

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
    failure.value = err instanceof Error ? err.message : String(err)
  } finally {
    switching.value = null
  }
}
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

      <template v-if="portals.length">
        <p class="mt-3 text-xs font-medium text-foreground">
          {{ inDesktop ? 'Switch Aruna Desktop to a management node' : 'Open the portal on a management node' }}
        </p>
        <ul class="mt-2 space-y-2">
          <li v-for="portal in portals" :key="portal.id" class="flex items-center justify-between gap-3">
            <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ portal.url }}</span>
            <Button
              v-if="inDesktop"
              size="sm"
              variant="outline"
              :disabled="!!switching"
              @click="switchTo(portal.url)"
            >
              <ArrowRightLeft class="h-3.5 w-3.5" /> {{ switching === portal.url ? 'Switching…' : 'Switch' }}
            </Button>
            <a
              v-else
              :href="portal.url"
              target="_blank"
              rel="noopener noreferrer"
              class="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink class="h-3.5 w-3.5" /> Open
            </a>
          </li>
        </ul>
        <p v-if="inDesktop" class="mt-2 text-[11px] text-muted-foreground">
          Switching ends this session; sign in again on the new node.
        </p>
      </template>
      <p v-else class="mt-3 text-xs leading-relaxed text-muted-foreground">
        {{
          inDesktop
            ? 'Connect Aruna Desktop to a management node instead. A realm administrator knows its address.'
            : 'A realm administrator knows the address of a management portal.'
        }}
      </p>

      <p
        v-if="failure"
        class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ failure }}
      </p>
    </div>
  </div>
</template>
