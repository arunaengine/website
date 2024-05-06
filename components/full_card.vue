<script setup lang="ts">
import { IconFileInfo } from "@tabler/icons-vue";

const props = defineProps<{
  description: string | undefined;
}>();
</script>

<template>
  <div class="col-lg-12 col-sm-12">
    <div class="card card">
      <div class="card-header m-0">
        <span class="text-secondary icon-lg me-2 mt-1">
          <IconFileInfo :size="24" />
        </span>
        <h3 class="h2 text-secondary mb-0 align-items-top">Description</h3>
      </div>
      <div class="card-body">
        <div class="align-items-center">
          <div class="col-auto me-6">
            <div class="text-start card-text align-items-center">
              <div class="text-muted">{{ description }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
