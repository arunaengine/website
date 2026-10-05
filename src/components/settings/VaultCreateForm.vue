<script setup lang="ts">
// The passphrase that seals provider keys on the node, chosen once. A recovery code,
// when asked for, is shown by VaultRecoveryCode, which stays while the vault state changes.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useUserVault } from '@/composables/useUserVault'
import { MIN_KEY_HOLDER_PASSPHRASE_LENGTH } from '@/lib/vault/crypto'
import { errorMessage } from '@/lib/utils'

const emit = defineEmits<{ (e: 'done'): void }>()
const { create } = useUserVault()

const passphrase = ref('')
const repeat = ref('')
const withRecovery = ref(true)
const busy = ref(false)
const failure = ref<string | null>(null)

const tooShort = computed(() => passphrase.value.length > 0 && passphrase.value.length < MIN_KEY_HOLDER_PASSPHRASE_LENGTH)
const mismatch = computed(() => repeat.value.length > 0 && repeat.value !== passphrase.value)
const canCreate = computed(() =>
  passphrase.value.length >= MIN_KEY_HOLDER_PASSPHRASE_LENGTH && repeat.value === passphrase.value && !busy.value)

async function submit() {
  if (!canCreate.value) return
  busy.value = true
  failure.value = null
  try {
    await create(passphrase.value, withRecovery.value)
    passphrase.value = ''
    repeat.value = ''
    emit('done')
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground" for="vault-passphrase">Passphrase</label>
        <Input
          id="vault-passphrase"
          v-model="passphrase"
          type="password"
          class="mt-1.5"
          autocomplete="new-password"
          :placeholder="`At least ${MIN_KEY_HOLDER_PASSPHRASE_LENGTH} characters`"
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
      It needs {{ MIN_KEY_HOLDER_PASSPHRASE_LENGTH }} characters because the same vault opens encrypted buckets.
    </p>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <div class="flex justify-end">
      <Button size="sm" :disabled="!canCreate" @click="submit">{{ busy ? 'Creating' : 'Create' }}</Button>
    </div>
  </div>
</template>
