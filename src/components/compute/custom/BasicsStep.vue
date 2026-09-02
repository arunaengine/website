<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import { injectCustomRun } from '@/composables/useCustomRun'

const { name, description, groupId, groupOptions } = injectCustomRun()
</script>

<template>
  <div class="max-w-xl space-y-4">
    <div data-tutorial="run-name">
      <label class="text-xs font-medium text-foreground">Name <span class="text-muted-foreground">(optional)</span></label>
      <Input v-model="name" class="mt-1" placeholder="align-and-count" />
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Description <span class="text-muted-foreground">(optional)</span></label>
      <Textarea v-model="description" class="mt-1" rows="3" />
    </div>
    <div data-tutorial="run-group">
      <label class="text-xs font-medium text-foreground">Group</label>
      <GroupSelect v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
      <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Sets the required <code class="rounded bg-muted px-1">aruna-engine.org/group</code> tag; the node accounts the run and writes its run dataset under this group.
      </p>
    </div>
  </div>
</template>
