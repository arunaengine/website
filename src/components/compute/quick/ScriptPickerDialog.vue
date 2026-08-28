<script setup lang="ts">
// Picks an existing script object into the editor; unchanged content is reused
// directly, editing it uploads a fresh per-run copy.
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import { injectQuickRun } from '@/composables/useQuickRun'
import { FolderOpen } from '@lucide/vue'

const {
  loadScriptOpen,
  loadScriptBusy,
  loadScriptError,
  pendingScriptPick,
  editorHasCustomContent,
  onScriptPick,
  applyScriptPick,
} = injectQuickRun()
</script>

<template>
  <Dialog :open="loadScriptOpen" @update:open="(v: boolean) => (loadScriptOpen = v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><FolderOpen class="h-4 w-4 text-primary" /> Load existing script</DialogTitle>
        <DialogDescription>
          Pick a script object to load into the editor. Unchanged content is reused directly; editing it uploads a fresh per-run copy.
        </DialogDescription>
      </DialogHeader>
      <Notice v-if="pendingScriptPick && editorHasCustomContent" tone="warning" class="space-y-2">
        <p>
          Replace the current editor content with
          <span class="font-mono">{{ pendingScriptPick.name }}</span>? Unsaved changes are lost.
        </p>
        <div class="flex gap-2">
          <Button size="sm" :disabled="loadScriptBusy" @click="applyScriptPick">
            {{ loadScriptBusy ? 'Loading…' : 'Replace script' }}
          </Button>
          <Button variant="outline" size="sm" :disabled="loadScriptBusy" @click="pendingScriptPick = null">Cancel</Button>
        </div>
      </Notice>
      <ObjectBrowserPanel v-else @select="onScriptPick" />
      <p v-if="loadScriptBusy && !(pendingScriptPick && editorHasCustomContent)" class="text-[11px] text-muted-foreground">
        Loading script…
      </p>
      <p v-if="loadScriptError" class="text-[11px] text-destructive">{{ loadScriptError }}</p>
      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
