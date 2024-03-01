
<script setup lang="ts">
import { Colors } from "@/composables/tabler_utils"
import { IconFileAnalytics } from "@tabler/icons-vue";
import { IconCylinder, IconFileText } from "@tabler/icons-vue";

const props = defineProps<{
    icon_id: string,
    text?: string,
    bg_color: Colors,
    text_color: Colors
}>()


</script>



<template>
    <div class="col-sm-12 col-xl-6 col-xxl-4">
        <div class="card card-sm">
            <div class="card-body p-2">
                <div class="row align-items-center">

                    <!-- Tabler Icon -->
                    <div v-if="icon_id === 'ID'" class="col-auto ms-2">
                        <span :class="`text-white avatar bg-${bg_color.toString()}`">
                            <IconCylinder :size="24" :stroke-width="2" />
                        </span>
                    </div>
                    <div v-else-if="icon_id === 'Name'" class="col-auto ms-2">
                        <span :class="`text-white avatar bg-${bg_color.toString()}`">
                            <IconFileText :size="24" :stroke-width="2" />
                        </span>
                    </div>
                    <div v-else-if="icon_id === 'Stats'" class="col-auto ms-2">
                        <span :class="`text-white avatar bg-${bg_color.toString()}`">
                            <IconFileAnalytics :size="24" :stroke-width="2" />
                        </span>
                    </div>

                    <!-- Text -->
                    <div class="col-auto">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">{{ icon_id }}</div>
                            <div :class="`h3 mb-0 w-auto text-${text_color.toString()}`">
                                {{ text }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>