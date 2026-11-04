<script setup lang="ts">
// The login rows of the sign-in chooser: the configured logins, or the realm's plain sign-in.
// The default slot adds rows of its own in the same style.
import ProviderLogo from '@/components/auth/ProviderLogo.vue'
import { portalConfig, type LoginOption } from '@/lib/config'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ choose: [option: LoginOption] }>()

const PLAIN_SIGN_IN: LoginOption = {
  name: 'Realm account',
  description: 'Sign in at this realm',
  logo: '/brand/providers/aruna.webp',
  params: {},
  linkParams: {},
}
const configured = portalConfig().login.options
const choices = configured.length ? configured : [PLAIN_SIGN_IN]
const rowClass =
  'flex w-full items-center justify-center gap-3 rounded-md border border-border px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted/50'
</script>

<template>
  <ul class="flex flex-col gap-2.5">
    <li v-for="choice in choices" :key="choice.name">
      <button type="button" :title="choice.description || undefined" :class="rowClass" :disabled="disabled" @click="emit('choose', choice)">
        <ProviderLogo :logo="choice.logo" :logo-light="choice.logoLight" />
        <span class="w-44 text-left">{{ choice.name }}</span>
      </button>
    </li>
    <slot :row-class="rowClass" />
  </ul>
</template>
