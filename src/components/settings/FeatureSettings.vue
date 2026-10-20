<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import { useAruna } from '@/composables/useAruna'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { FEATURE_GROUPS, featureAvailable } from '@/lib/features'

const { userInfo } = useAruna()
const { shown, choice, setChoice } = usePortalFeatures()

// Features this deployment does not serve have nothing to switch.
const groups = FEATURE_GROUPS.map((group) => ({
  ...group,
  features: group.features.filter((info) => featureAvailable(info.key)),
})).filter((group) => group.features.length)
</script>

<template>
  <section class="surface">
    <header class="border-b border-border px-5 py-4">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">Features</h3>
      <p class="text-xs text-muted-foreground">Show or hide parts of the portal. Hidden features keep working.</p>
    </header>
    <div class="space-y-5 p-5">
      <div v-for="group in groups" :key="group.label">
        <h4 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{{ group.label }}</h4>
        <ul class="mt-1 divide-y divide-border">
          <li v-for="info in group.features" :key="info.key" class="flex items-center gap-4 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-foreground">{{ info.label }}</div>
              <div class="text-xs text-muted-foreground">{{ info.description }}</div>
            </div>
            <Button
              v-if="choice(info.key) !== null"
              variant="link"
              size="sm"
              class="h-auto px-0 text-xs"
              :disabled="!userInfo"
              @click="setChoice(info.key, null)"
            >Use realm default</Button>
            <span v-else class="text-xs text-muted-foreground">Realm default</span>
            <Switch
              :checked="shown(info.key)"
              :disabled="!userInfo"
              :aria-label="info.label"
              @update:checked="(value: boolean) => setChoice(info.key, value)"
            />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
