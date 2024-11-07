<script setup lang="ts">
import { IconCheck } from '@tabler/icons-vue'
import { v2KeyValueVariant, type v2KeyValue } from '~/composables/aruna_api_json'

const props = defineProps<{
  key_values: v2KeyValue[] | undefined
}>()

function getLabels(): v2KeyValue[] | undefined {
  return props.key_values?.filter((kv) => {
    if (kv.variant) {
      return [v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL, v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL].includes(kv.variant)
    } else {
      return false
    }
  })
}
</script>

<template>
  <div class="-m-1.5 overflow-x-auto">
    <div class="p-1.5 min-w-full inline-block align-middle">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-aruna-text/50">
          <thead>
            <tr>
              <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">Key</th>
              <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">Value</th>
              <th scope="col" class="px-6 py-3 text-center text-sm font-medium text-aruna-text-accent uppercase">Static
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-aruna-text/50">
            <tr v-for="label in getLabels()" class="hover:bg-aruna-fg">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
                 {{ label.key }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-aruna-text">
                <div v-html="prettyDisplayJson(label.value)" />
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                  <IconCheck v-if="label.variant === v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL"
                             :size="24"
                             class="inline-flex text-aruna-highlight"/>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>