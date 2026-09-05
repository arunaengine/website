<script setup lang="ts">
// The passphrase that seals provider keys on the node, chosen once. A
// recovery code, when asked for, is shown here a single time.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useUserVault } from '@/composables/useUserVault'
import { MIN_PASSPHRASE_LENGTH } from '@/lib/vault/crypto'
import { errorMessage } from '@/lib/utils'

const emit = defineEmits<{ (e: 'done'): void }>()
const { create } = useUserVault()

const passphrase = ref('')
const repeat = ref('')
const withRecovery = ref(true)
const busy = ref(false)
const failure = ref<string | null>(null)
const recoveryCode = ref<string | null>(null)

const tooShort = computed(() => passphrase.value.length > 0 && passphrase.value.length < MIN_PASSPHRASE_LENGTH)
const mismatch = computed(() => repeat.value.length > 0 && repeat.value !== passphrase.value)
const canCreate = computed(() =>
  passphrase.value.length >= MIN_PASSPHRASE_LENGTH && repeat.value === passphrase.value && !busy.value)

async function submit() {
  if (!canCreate.value) return
  busy.value = true
  failure.value = null
  try {
    const code = await create(passphrase.value, withRecovery.value)
    passphrase.value = ''
    repeat.value = ''
    if (code) recoveryCode.value = code
    else emit('done')
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="recoveryCode" class="space-y-3">
    <Notice tone="success" title="Your recovery code">
      It is shown only this once. Keep it somewhere safe: it opens your provider keys when you forget the passphrase.
    </Notice>
    <div class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <code class="min-w-0 flex-1 break-all font-mono text-xs" data-recovery-code>{{ recoveryCode }}</code>
      <CopyButton :value="recoveryCode" label="Copy the recovery code" />
    </div>
    <div class="flex justify-end">
      <Button size="sm" @click="emit('done')">Done</Button>
    </div>
  </div>
  <div v-else class="space-y-3">
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground" for="vault-passphrase">Passphrase</label>
        <Input
          id="vault-passphrase"
          v-model="passphrase"
          type="password"
          class="mt-1.5"
          autocomplete="new-password"
          :placeholder="`At least ${MIN_PASSPHRASE_LENGTH} characters`"
          :invalid="tooShort ? 'error' : undefined"
          @keydown.enter.prevent="submit"
        />
      </div>
      <div>
        <label class="text-xs font-medium text-foreground" for="vault-repeat">Repeat passphrase</label>
        <Input
          id="vault-repeat"
          v-model="repeat"
          type="password"
          class="mt-1.5"
          autocomplete="new-password"
          placeholder="The same passphrase"
          :invalid="mismatch ? 'error' : undefined"
          @keydown.enter.prevent="submit"
        />
      </div>
    </div>
    <label class="flex items-start gap-2 text-xs text-muted-foreground">
      <input type="checkbox" class="mt-0.5" :checked="withRecovery" @click="withRecovery = !withRecovery" />
      <span>Also create a recovery code. It opens your keys if you forget the passphrase and is shown once.</span>
    </label>
    <p class="text-xs text-muted-foreground">
      The passphrase never leaves this browser. Without it, or the recovery code, the keys on the node cannot be opened again.
    </p>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <div class="flex justify-end">
      <Button size="sm" :disabled="!canCreate" @click="submit">{{ busy ? 'Creating' : 'Create' }}</Button>
    </div>
  </div>
</template>
