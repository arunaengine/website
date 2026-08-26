<script setup lang="ts">
// Redeems an enrollment on this device: the owner pastes the aruna://enroll
// link the portal minted, or the bare one-time code. The realm-side half (who
// may mint one, and the device cap) lives in the portal's Devices section.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { enrollApply, type EnrollInvite } from '@/lib/desktopBridge'
import { parseEnrollInput } from '@/lib/enrollLink'
import { truncateMiddle } from '@/lib/utils'
import { Check } from '@lucide/vue'

// An enrollment the shell already acted on, from a deep link the owner
// followed. It arrives applied or failed; nothing is left to redeem here.
const props = defineProps<{ invite?: EnrollInvite | null }>()
const emit = defineEmits<{ (e: 'enrolled'): void }>()

const pasted = ref('')
const label = ref('')
const applying = ref(false)
const failure = ref<string | null>(null)
const joined = ref<{ nodeId: string | null; realm: string | null } | null>(null)

const parsed = computed(() => parseEnrollInput(pasted.value))
const invalid = computed(() => pasted.value.trim().length > 0 && !parsed.value)
const fromLink = ref(false)

watch(
  () => props.invite,
  (next) => {
    if (!next) return
    fromLink.value = true
    if (next.applied) {
      failure.value = null
      joined.value = { nodeId: null, realm: next.realm }
      pasted.value = ''
    } else {
      joined.value = null
      failure.value = next.error ?? 'Aruna Desktop could not use that enrollment link.'
    }
  },
  { immediate: true },
)

async function apply(): Promise<void> {
  const input = parsed.value
  if (!input || applying.value) return
  applying.value = true
  fromLink.value = false
  failure.value = null
  try {
    const name = label.value.trim()
    joined.value = await enrollApply({ ...input, ...(name ? { label: name } : {}) })
    pasted.value = ''
    emit('enrolled')
  } catch (err) {
    failure.value = err instanceof Error ? err.message : String(err)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="surface space-y-4 p-5">
    <div>
      <h3 class="font-display text-sm font-semibold text-aruna-navy">Enroll this device</h3>
      <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
        Mint a code in the portal under Settings → Devices, then open its link here or paste the code.
      </p>
      <ul class="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
        <li>The code is one-time and expires.</li>
        <li>This device joins as a user node bound to your account.</li>
      </ul>
      <p v-if="fromLink" class="mt-2 text-[11px] text-muted-foreground">
        Aruna Desktop acted on the enrollment link you opened; its outcome is below.
      </p>
    </div>

    <div>
      <label class="text-xs font-medium text-foreground" for="enroll-code">Enrollment link or code</label>
      <Textarea
        id="enroll-code"
        v-model="pasted"
        rows="3"
        class="mt-1"
        :invalid="invalid ? 'error' : undefined"
        placeholder="aruna://enroll?secret=…"
      />
      <p v-if="invalid" class="mt-1 text-[11px] text-destructive">
        That is neither an aruna://enroll link nor an enrollment code.
      </p>
      <p v-else-if="parsed?.realm" class="mt-1 text-[11px] text-muted-foreground">
        Realm {{ truncateMiddle(parsed.realm, 10, 6) }}<span v-if="parsed.seedUrl"> via {{ parsed.seedUrl }}</span>
      </p>
    </div>

    <div>
      <label class="text-xs font-medium text-foreground" for="device-label">Device name (optional)</label>
      <Input id="device-label" v-model="label" placeholder="work-laptop" class="mt-1" />
    </div>

    <RefusalNote v-if="failure" :message="failure" />

    <div v-if="joined" class="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span class="min-w-0 break-all text-muted-foreground">
        Enrolled as {{ joined.nodeId ? truncateMiddle(joined.nodeId, 10, 6) : 'a user node' }}<span
          v-if="joined.realm"
        >
          in realm {{ truncateMiddle(joined.realm, 10, 6) }}</span
        >.
      </span>
    </div>

    <div class="flex justify-end">
      <Button :disabled="!parsed || applying" @click="apply">
        {{ applying ? 'Enrolling…' : 'Enroll this device' }}
      </Button>
    </div>
  </div>
</template>
