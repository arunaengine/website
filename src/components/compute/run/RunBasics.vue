<script setup lang="ts">
// Name, owning group and description of the run.
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import RunSection from '@/components/compute/run/RunSection.vue'
import AiMark from '@/components/compute/run/AiMark.vue'
import { injectCustomRun } from '@/composables/useCustomRun'

const { name, description, groupId, groupOptions, hasAi, clearAi } = injectCustomRun()

const complete = computed(() => groupId.value.length > 0)
const groupName = computed(() => groupOptions.value.find((g) => g.value === groupId.value)?.label ?? '')
</script>

<template>
  <RunSection
    id="section-run"
    title="Run"
    :complete="complete"
    :check-label="complete ? 'Complete' : 'Needs a group'"
  >
    <template #state>
      <template v-if="complete">{{ name.trim() || 'unnamed' }} · {{ groupName }}</template>
      <template v-else>Needs a group.</template>
    </template>

    <div class="grid gap-4 sm:grid-cols-[2fr_1.3fr_2.2fr]">
      <div data-tutorial="run-name" class="min-w-0">
        <label for="run-name" class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Name <AiMark v-if="hasAi('name')" />
        </label>
        <Input
          id="run-name"
          v-model="name"
          class="mt-1"
          placeholder="align-and-count"
          @update:model-value="clearAi('name')"
        />
      </div>
      <div data-tutorial="run-group" id="run-group" class="min-w-0">
        <label class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span>Group<span class="ml-0.5 text-destructive" aria-hidden="true">*</span><span class="sr-only">(required)</span></span>
        </label>
        <GroupSelect
          v-model="groupId"
          :options="groupOptions"
          placeholder="Select a group"
          class="mt-1"
          aria-label="Group"
          :invalid="complete ? undefined : 'error'"
        />
      </div>
      <div class="min-w-0">
        <label for="run-description" class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Description <span class="font-normal text-muted-foreground">optional</span>
          <AiMark v-if="hasAi('description')" />
        </label>
        <Input
          id="run-description"
          v-model="description"
          class="mt-1"
          placeholder="What this run does"
          @update:model-value="clearAi('description')"
        />
      </div>
    </div>
  </RunSection>
</template>
