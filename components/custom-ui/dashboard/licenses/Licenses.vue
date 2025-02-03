<script setup lang="ts">
import {IconPlus, IconSearch} from "@tabler/icons-vue";
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from "~/components/ui/resizable";
import {Separator} from "~/components/ui/separator";
import {Input} from "~/components/ui/input";
import {TooltipProvider, Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";

import LicensesList from "~/components/custom-ui/dashboard/licenses/LicensesList.vue";
import LicenseDisplay from "~/components/custom-ui/dashboard/licenses/LicenseDisplay.vue";
import LicenseEditor from "~/components/custom-ui/dashboard/licenses/LicenseEditor.vue";

// ----- Properties ---------- //
interface LicensesProps {
  licenses: License[]
}
const props = defineProps<LicensesProps>()
const licenses = toRef(() => props.licenses)
const searchValue = ref('')
const selectedLicense = ref<License | undefined>(undefined)
const editMode = ref<boolean>(false)
// ----- End Properties ---------- //

watch(licenses, () => console.info('[Licenses] Updated available licenses:', licenses.value))
onActivated(() => console.info('[Licenses] Available licenses:', licenses.value))


</script>
<template>
  <ResizablePanelGroup
      id="resize-panel-group-1"
      direction="horizontal"
      class="h-full max-h-[calc(100vh-130px)] items-stretch">
    <ResizablePanel id="resize-panel-1" :default-size="35" :min-size="30" :max-size="50">
      <div class="flex items-center justify-between px-4 py-2">
        <h1 class="text-xl font-bold">
          Available Licenses
        </h1>
        <TooltipProvider :delay-duration="250">
          <Tooltip>
            <TooltipTrigger as-child>
              <IconPlus class="rounded-full border border-aruna-text-accent hover:border-aruna-highlight hover:text-aruna-highlight hover:cursor-pointer"
                        @click="editMode = true"/>
            </TooltipTrigger>
            <TooltipContent class="rounded-none text-aruna-highlight bg-aruna-muted border border-aruna-text/50">
              Create a new license
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Separator/>
      <div class="p-4">
        <form>
          <div class="relative">
            <IconSearch class="absolute left-2 top-2.5 size-4 text-muted-foreground"/>
            <Input v-model="searchValue" placeholder="Search" class="pl-8 bg-muted"/>
          </div>
        </form>
      </div>
      <LicensesList :licenses="licenses" v-model:selected-license="selectedLicense"/>
    </ResizablePanel>
    <ResizableHandle id="resize-handle-1" with-handle/>
    <ResizablePanel id="resize-panel-2" :default-size="65">
      <KeepAlive>
        <component :is="editMode ? LicenseEditor : LicenseDisplay"
                   v-model:selected-license="selectedLicense"
                   @closeEditor="editMode = false"/>
      </KeepAlive>
      <!-- <LicenseDisplay v-model:selected-license="selectedLicense"/> -->
    </ResizablePanel>
  </ResizablePanelGroup>
</template>