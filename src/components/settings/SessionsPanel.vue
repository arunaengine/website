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

const { currentUser } = useAruna()
const { signOut } = useAuth()
const { sessions, loading, error, busyIds, load, revoke } = useUserSessions()

const confirming = ref('')

let loadedOnce = false
watch(currentUser, (user) => {
  if (!user || loadedOnce) return
  loadedOnce = true
  void load()
}, { immediate: true })

const rows = computed(() => [...sessions.value].sort((a, b) => Number(b.current) - Number(a.current)))

function expired(session: UserSession): boolean {
  return new Date(session.expires_at).getTime() <= Date.now()
}

function stateLabel(session: UserSession): string {
  if (session.revoked) return 'revoked'
  return expired(session) ? 'expired' : 'active'
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
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Sessions</h3>
        <p class="text-xs text-muted-foreground">
          Every token issued for your account is bound to a session. Revoking one stops it everywhere it is used.
        </p>
      </div>
      <RefreshButton :busy="loading" sr-label="Refresh sessions" @click="load" />
    </header>

    <p v-if="!currentUser" class="px-5 py-6 text-xs text-muted-foreground">Sign in to see your sessions.</p>
    <template v-else>
      <RefusalNote v-if="error" :message="error" class="mx-5 mt-4" />
      <div class="min-w-0 overflow-x-auto">
        <table class="w-full min-w-max text-sm">
          <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-5 py-2 text-left font-semibold">Kind</th>
              <th class="px-5 py-2 text-left font-semibold">Label</th>
              <th class="px-5 py-2 text-left font-semibold">Created</th>
              <th class="px-5 py-2 text-left font-semibold">Expires</th>
              <th class="px-5 py-2 text-left font-semibold">State</th>
              <th class="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="session in rows" :key="session.session_id" class="border-t border-border">
              <td class="px-5 py-2.5">
                <Badge size="sm" variant="secondary" class="uppercase">{{ SESSION_KIND_LABELS[session.kind] }}</Badge>
              </td>
              <td class="px-5 py-2.5 text-[12px] text-foreground">
                {{ session.label || session.session_id.slice(0, 8) }}
                <Badge v-if="session.current" size="sm" variant="accent" class="ml-1.5 uppercase">this browser</Badge>
              </td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="new Date(session.created_at).toLocaleString()">
                {{ relativeTime(session.created_at) }}
              </td>
              <td
                class="px-5 py-2.5 text-[11px]"
                :class="expired(session) ? 'text-destructive' : 'text-muted-foreground'"
                :title="new Date(session.expires_at).toLocaleString()"
              >
                {{ relativeTime(session.expires_at) }}
              </td>
              <td class="px-5 py-2.5">
                <Badge
                  size="sm"
                  :variant="session.revoked ? 'destructive' : expired(session) ? 'secondary' : 'accent'"
                  class="uppercase"
                >{{ stateLabel(session) }}</Badge>
              </td>
              <td class="px-5 py-2.5 text-right">
                <template v-if="!session.revoked">
                  <div v-if="confirming === session.session_id" class="flex items-center justify-end gap-2">
                    <span class="text-[11px] text-muted-foreground">
                      {{ session.current ? 'This signs you out here.' : 'Revoke this session?' }}
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
              <td colspan="6" class="px-5 py-6 text-center text-xs text-muted-foreground">
                {{ loading ? 'Loading sessions…' : 'No sessions listed by this node.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
