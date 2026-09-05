<script setup lang="ts">
// The passphrase that seals provider keys on this node: unlock the keys here,
// change the passphrase, lock them again, or reset and start over.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import VaultUnlockForm from './VaultUnlockForm.vue'
import { useUserVault } from '@/composables/useUserVault'
import { MIN_PASSPHRASE_LENGTH } from '@/lib/vault/crypto'
import { errorMessage } from '@/lib/utils'

const { state, error, lock, changePassphrase, reset } = useUserVault()

const changing = ref(false)
const resetting = ref(false)
const useRecovery = ref(false)
const current = ref('')
const next = ref('')
const repeat = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)

const shown = computed(() => state.value === 'locked' || state.value === 'unlocked' || Boolean(error.value))
const canChange = computed(() =>
  current.value.trim().length > 0
  && next.value.length >= MIN_PASSPHRASE_LENGTH
  && repeat.value === next.value
  && !busy.value)

function openChange() {
  current.value = ''
  next.value = ''
  repeat.value = ''
  useRecovery.value = false
  failure.value = null
  changing.value = true
}

function openReset() {
  failure.value = null
  resetting.value = true
}

async function confirmChange() {
  if (!canChange.value) return
  busy.value = true
  failure.value = null
  try {
    const secret = useRecovery.value ? { recoveryCode: current.value } : { passphrase: current.value }
    await changePassphrase(secret, next.value)
    changing.value = false
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function confirmReset() {
  busy.value = true
  failure.value = null
  try {
    await reset()
    resetting.value = false
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="shown" class="border-b border-border px-5 py-4">
    <Notice v-if="error" tone="error">The provider keys on this node could not be read: {{ error }}</Notice>
    <template v-else-if="state === 'locked'">
      <p class="text-sm font-medium text-foreground">Provider keys on this node</p>
      <p class="mt-0.5 text-xs text-muted-foreground">
        They are sealed with your passphrase. Unlock them to use and edit them in this browser.
      </p>
      <VaultUnlockForm class="mt-3" />
    </template>
    <div v-else class="flex flex-wrap items-center gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-foreground">Provider keys on this node</span>
          <Badge size="sm" variant="success">Unlocked</Badge>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          They stay unlocked in this browser until you lock them or sign out.
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" @click="openChange">Change passphrase</Button>
        <Button variant="outline" size="sm" @click="lock">Lock</Button>
        <Button variant="ghost" size="sm" class="text-destructive" @click="openReset">Reset</Button>
      </div>
    </div>

    <Dialog :open="changing" @update:open="(open: boolean) => (changing = open)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Change passphrase</DialogTitle>
          <DialogDescription>
            The keys on the node are sealed again with the new passphrase. The recovery code stays valid.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div>
            <label class="text-xs font-medium text-foreground" for="vault-current">
              {{ useRecovery ? 'Recovery code' : 'Current passphrase' }}
            </label>
            <Input
              id="vault-current"
              v-model="current"
              :type="useRecovery ? 'text' : 'password'"
              class="mt-1.5"
              :autocomplete="useRecovery ? 'off' : 'current-password'"
            />
            <button type="button" class="mt-1 text-xs text-primary hover:underline" @click="useRecovery = !useRecovery">
              {{ useRecovery ? 'Use the current passphrase' : 'Use the recovery code' }}
            </button>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground" for="vault-next">New passphrase</label>
            <Input
              id="vault-next"
              v-model="next"
              type="password"
              class="mt-1.5"
              autocomplete="new-password"
              :placeholder="`At least ${MIN_PASSPHRASE_LENGTH} characters`"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground" for="vault-next-repeat">Repeat new passphrase</label>
            <Input
              id="vault-next-repeat"
              v-model="repeat"
              type="password"
              class="mt-1.5"
              autocomplete="new-password"
              :invalid="repeat && repeat !== next ? 'error' : undefined"
            />
          </div>
          <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="changing = false">Cancel</Button>
          <Button size="sm" :disabled="!canChange" @click="confirmChange">{{ busy ? 'Changing' : 'Change passphrase' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="resetting" @update:open="(open: boolean) => (resetting = open)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your provider keys?</DialogTitle>
          <DialogDescription>
            This deletes the sealed keys from this node. Every provider key kept there is lost, in every browser,
            and the recovery code stops working. Keys in this browser session and a ChatGPT sign-in are kept.
          </DialogDescription>
        </DialogHeader>
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="resetting = false">Cancel</Button>
          <Button variant="destructive" size="sm" :disabled="busy" @click="confirmReset">Reset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
