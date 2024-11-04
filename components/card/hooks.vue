<script lang="ts" setup>
import {IconCheck} from "@tabler/icons-vue";
import {
  v2KeyValueVariant,
  type v2KeyValue,
} from "~/composables/aruna_api_json";

const props = defineProps<{
  key_values: v2KeyValue[] | undefined;
}>();

function getHooks(): v2KeyValue[] | undefined {
  return props.key_values?.filter((kv) => {
    if (kv.variant) {
      return [
        v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK,
        v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS,
      ].includes(kv.variant)
    } else {
      return false
    }
  });
}
</script>
<template>
  <div class="-m-1.5 overflow-x-auto">
    <div class="p-1.5 min-w-full inline-block align-middle">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-aruna-text/50">
          <thead>
          <tr>
            <th class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase" scope="col">Key</th>
            <th class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase" scope="col">Value</th>
            <th class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase" scope="col">Status</th>
          </tr>
          </thead>
          <tbody class="divide-y divide-aruna-text/50">
          <tr v-for="hook in getHooks()" class="hover:bg-aruna-fg">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              {{ hook.key }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-aruna-text">
              {{ hook.value }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                <span v-if="hook.variant === v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS"
                      class="status status-green">
                  <IconCheck :size="24"/>
                </span>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
