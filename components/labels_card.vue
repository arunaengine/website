<script setup lang="ts">
import { IconCheck } from '@tabler/icons-vue'
import { IconTags } from '@tabler/icons-vue'
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

function displayLabelValue(value: string | undefined): string {
    if (value) {
        try {
            return `<pre>${JSON.stringify(JSON.parse(value), null, 2)}</pre>`
        } catch (error) {
            return value
        }
    }

    return ''
}
</script>

<template>
    <div class="col-xl-12 col-xxl-6">
        <div class="card card-body-scrollable card-body-scrollable-shadow">
            <div class="card-header m-0">
                <span class="text-secondary icon-lg me-2 mt-1">
                    <IconTags :size="24" />
                </span>
                <h3 class="h2 text-secondary mb-0 align-items-top">Labels</h3>
            </div>
            <div class="card-table table-responsive">
                <table class="table table-vcenter text-start">
                    <thead>
                        <tr>
                            <th class="text-start">KEY</th>
                            <th>VALUE</th>
                            <th>STATIC</th>
                        </tr>
                    </thead>
                    <tbody v-if="props.key_values">
                        <tr v-for="label in getLabels()">
                            <td class="text-start">
                                <!-- <A href=format!( "/search?filter_key={}&filter_value={}" , key.clone(), value.clone(), ) exact=true class=""></A> -->
                                <div>
                                    <span class="text-muted">{{ label.key }}</span>
                                </div>
                            </td>
                            <td>
                                <!-- <A href=format!( "/search?filter_key={}&filter_value={}" , key.clone(), value.clone(), ) exact=true class=""></A> -->
                                <div v-html="displayLabelValue(label.value)" />
                            </td>
                            <td class="align-self-end p-1">
                                <span v-if="label.variant === v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL"
                                    class="status status-green">
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