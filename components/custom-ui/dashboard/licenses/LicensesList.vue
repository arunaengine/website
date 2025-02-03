<script setup lang="ts">
import {ScrollArea} from "~/components/ui/scroll-area";
import {Badge} from "~/components/ui/badge";

// ----- Properties ---------- //
interface LicensesListProps {
  licenses: License[]
}

const props = defineProps<LicensesListProps>()
const licenses = toRef(() => props.licenses)
const selectedLicense = defineModel<License>('selectedLicense', {required: false})
// ----- End Properties ---------- //

watch(licenses, () => console.info('[LicensesList] Updated available licenses:', licenses.value))
onActivated(() => console.info('[LicensesList] Available licenses:', licenses.value))

const emit = defineEmits<{ (e: 'selectLicense', license: License): void }>();
</script>
<template>
  <ScrollArea class="h-full flex">
    <div class="flex-1 flex flex-col gap-2 p-4 pt-0">
      <TransitionGroup name="list" appear>
        <button v-for="license in licenses"
                :key="license.id"
                :class="cn('flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent',
                             selectedLicense?.id === license.id && 'bg-muted',)"
                @click="selectedLicense = license">
          <div class="flex w-full flex-col gap-1">
            <div class="flex items-center">
              <div class="flex items-center gap-2">
                <div class="font-semibold">
                  {{ license.name }}
                </div>
              </div>
            </div>

            <div class="text-xs font-medium">
              {{ license.id }}
            </div>
          </div>
          <div class="line-clamp-2 text-xs text-muted-foreground">
            {{ license.description }}
            <!-- {{ item.message.substring(0, 300) }} -->
            <!--{{ item.text.substring(0, 300) }}-->
          </div>
          <div class="flex items-center gap-2">
            <Badge v-if="license.terms.includes('Creative Commons')" variant="outline">CC</Badge>
            <!-- TODO: Badges (?)
            <Badge v-if="item.requester.User" variant="secondary">User</Badge>
            <Badge v-if="item.requester.User?.impersonated_by" variant="default">Impersonated</Badge>
            <Badge v-if="item.requester.User?.auth_method.Oidc" variant="default">OIDC</Badge>
            <Badge v-if="item.requester.User?.auth_method.Aruna" variant="default">Aruna</Badge>
            -->
          </div>
        </button>
      </TransitionGroup>
    </div>
  </ScrollArea>
</template>