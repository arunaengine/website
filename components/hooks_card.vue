<script setup lang="ts">
import { IconCheck } from "@tabler/icons-vue";
import { IconWebhook } from "@tabler/icons-vue";
import {
  v2KeyValueVariant,
  type v2KeyValue,
} from "~/composables/aruna_api_json";

const props = defineProps<{
  key_values: v2KeyValue[] | undefined;
}>();

function getLabels(): v2KeyValue[] | undefined {
  return props.key_values?.filter((kv) => {
    if (kv.variant) {
      [
        v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK,
        v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS,
      ].includes(kv.variant);
    } else {
      false;
    }
  });
}
</script>

<template>
  <div class="col-xl-12 col-xxl-6">
    <div class="card card-body-scrollable card-body-scrollable-shadow">
      <div class="card-header m-0">
        <span class="text-secondary icon-lg me-2 mt-1">
          <IconWebhook :size="24" />
        </span>
        <h3 class="h2 text-secondary mb-0 align-items-top">Hooks</h3>
      </div>
      <div class="card-table table-responsive">
        <table class="table table-vcenter text-start">
          <thead>
            <tr>
              <th class="text-start">KEY</th>
              <th>VALUE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody v-if="props.key_values">
            <tr v-for="label in getLabels()">
              <td class="text-start">
                <!-- <A href=format!( "/search?filter_key={}&filter_value={}" , key.clone(), value.clone(), ) exact=true class=""></A> -->
                <div>{{ label.key }}</div>
              </td>
              <td>
                <!-- <A href=format!( "/search?filter_key={}&filter_value={}" , key.clone(), value.clone(), ) exact=true class=""></A> -->
                <div>{{ label.value }}</div>
              </td>
              <td class="align-self-end p-1">
                <span
                  v-if="
                    label.variant ===
                    v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS
                  "
                  class="status status-green"
                >
                  <IconCheck :size="24" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
