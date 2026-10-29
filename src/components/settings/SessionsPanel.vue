<script setup lang="ts">
// Every bearer this account holds, listed by the session it is bound to.
// Revoking the session this browser is using ends the sign-in as well.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useUserSessions } from '@/composables/useUserSessions'
import { SESSION_KIND_LABELS, type UserSession } from '@/lib/api'
import { relativeTime } from '@/lib/utils'

const { currentUser, sessionEpoch } = useAruna()
const { signOut } = useAuth()
const { sessions, listed, loading, error, busyIds, load, revoke } = useUserSessions()

const confirming = ref('')

// Each session epoch lists again: the `current` flags of another token's list are not ours.
watch([currentUser, sessionEpoch], ([user], before) => {
  if (user && (!before || !listed.value)) void load()
}, { immediate: true })

// This browser first, then the newest; the list opens with the newest five.
const SHOWN = 5
const all = ref(false)
const sorted = computed(() =>
  [...sessions.value].sort((a, b) => Number(b.current) - Number(a.current) || b.created_at.localeCompare(a.created_at)),
)
const rows = computed(() => (all.value ? sorted.value : sorted.value.slice(0, SHOWN)))

function expired(session: UserSession): boolean {
  return new Date(session.expires_at).getTime() <= Date.now()
}

// The other sign-ins that still work; "Sign out all others" revokes each of them in turn.
const others = computed(() => sessions.value.filter((session) => !session.current && !session.revoked && !expired(session)))
const confirmingOthers = ref(false)
async function signOutOthers() {
  confirmingOthers.value = false
  const epoch = sessionEpoch.value
  for (const session of others.value) {
    if (epoch !== sessionEpoch.value || !listed.value) return
    await revoke(session.session_id)
  }
}

async function confirmRevoke(session: UserSession) {
  confirming.value = ''
  const wasCurrent = await revoke(session.session_id)
  if (wasCurrent) await signOut()
}
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Sign-ins</h3>
        <p class="text-xs text-muted-foreground">Where your account is signed in. Revoke one to sign it out everywhere.</p>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="others.length">
          <template v-if="confirmingOthers">
            <span class="text-[11px] text-muted-foreground">Sign out {{ others.length }} other {{ others.length === 1 ? 'sign-in' : 'sign-ins' }}?</span>
            <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="!listed || loading" @click="signOutOthers">Sign out</Button>
            <Button variant="ghost" size="sm" @click="confirmingOthers = false">Cancel</Button>
          </template>
          <Button v-else variant="outline" size="sm" :disabled="!listed || loading" @click="confirmingOthers = true">Sign out all others</Button>
        </template>
        <RefreshButton :busy="loading" sr-label="Refresh sign-ins" @click="load" />
      </div>
    </header>

    <p v-if="!currentUser" class="px-5 py-6 text-xs text-muted-foreground">Sign in to see where you are signed in.</p>
    <template v-else>
      <RefusalNote v-if="error" :message="error" class="mx-5 mt-4" />
      <div class="min-w-0 overflow-x-auto">
        <table class="w-full min-w-max text-sm">
          <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-5 py-2 text-left font-semibold">Where</th>
              <th class="px-5 py-2 text-left font-semibold">Signed in</th>
              <th class="px-5 py-2 text-left font-semibold">Expires</th>
              <th class="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="session in rows" :key="session.session_id" class="border-t border-border">
              <td class="px-5 py-2.5 text-[12px] text-foreground" :title="[session.label, session.session_id].filter(Boolean).join(', ')">
                {{ SESSION_KIND_LABELS[session.kind] }}
                <Badge v-if="session.current" size="sm" variant="accent" class="ml-1.5">this browser</Badge>
              </td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="new Date(session.created_at).toLocaleString()">
                {{ relativeTime(session.created_at) }}
              </td>
              <td
                class="px-5 py-2.5 text-[11px]"
                :class="session.revoked || expired(session) ? 'text-destructive' : 'text-muted-foreground'"
                :title="new Date(session.expires_at).toLocaleString()"
              >
                {{ session.revoked ? 'revoked' : expired(session) ? `expired ${relativeTime(session.expires_at)}` : relativeTime(session.expires_at) }}
              </td>
              <td class="px-5 py-2.5 text-right">
                <template v-if="!session.revoked">
                  <div v-if="confirming === session.session_id" class="flex items-center justify-end gap-2">
                    <span class="text-[11px] text-muted-foreground">
                      {{ session.current ? 'This signs you out here.' : 'Revoke this sign-in?' }}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="text-destructive hover:text-destructive"
                      :disabled="busyIds.includes(session.session_id)"
                      @click="confirmRevoke(session)"
                    >Revoke</Button>
                    <Button variant="ghost" size="sm" @click="confirming = ''">Cancel</Button>
                  </div>
                  <Button
                    v-else
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    @click="confirming = session.session_id"
                  >Revoke</Button>
                </template>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="px-5 py-6 text-center text-xs text-muted-foreground">
                {{ loading ? 'Loading sign-ins…' : 'No sign-ins listed by this node.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="sorted.length > SHOWN" class="border-t border-border px-5 py-2">
        <Button variant="ghost" size="sm" @click="all = !all">{{ all ? `Show the newest ${SHOWN}` : `Show all ${sorted.length}` }}</Button>
      </div>
    </template>
  </section>
</template>
