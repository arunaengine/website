
<script setup lang="ts">
import { IconFileAnalytics } from "@tabler/icons-vue";
import type { v2Stats } from "~/composables/aruna_api_json";

const props = defineProps<{
    stats: v2Stats | undefined
}>()
</script>

<template>
    <div class="col-sm-12 col-xl-6 col-xxl-4">
        <div class="card card-sm">
            <div class="card-body p-2">
                <div class="row align-items-center">
                    <div class="col-auto ms-2">
                        <span :class="`text-white avatar bg-${Colors.Green.toString()}`">
                            <IconFileAnalytics :size="24" :stroke-width="2" />
                        </span>
                    </div>
                    <div class="col-auto me-6">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Count</div>
                            <div :class="`h2 mb-0 w-auto text-${Colors.Muted.toString()}`">
                                {{ stats?.count }}
                            </div>
                        </div>
                    </div>
                    <div class="col-auto border-start">
                        <div class="ms-2 text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Size</div>
                            <div v-if="stats?.size" :class="`h2 mb-0 w-auto text-${Colors.Muted.toString()}`">
                                {{ formatBytes(+stats.size) }}
                            </div>
                            <div v-else :class="`h2 mb-0 w-auto text-${Colors.Muted.toString()}`">
                                0 Bytes
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>