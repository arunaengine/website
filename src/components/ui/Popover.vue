<script setup lang="ts">
import {
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'radix-vue'
import { insideFloatingLayer } from '@/components/ui/layers'

const props = withDefaults(
  defineProps<{
    side?: 'top' | 'right' | 'bottom' | 'left'
    align?: 'start' | 'center' | 'end'
    /** Set inside the assistant panel, which floats above the modal layer. */
    raised?: boolean
    /** Set to control the popover; left out, it opens and closes on its own. */
    open?: boolean
    /** Shown on hover and focus; a tap on a touch screen opens the popover instead. */
    tooltip?: string
    /** Set for a table: wider, yet never wider than the screen. */
    wide?: boolean
  }>(),
  { open: undefined },
)
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

function keepOpen(event: Event) {
  if (insideFloatingLayer(event)) event.preventDefault()
}
</script>

<template>
  <PopoverRoot :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <!-- The button stays the trigger and the focus target; the wrapper only places the popover,
         as the tooltip trigger around the button would hide it from the popover. -->
    <PopoverAnchor v-if="tooltip" as-child>
      <span class="inline-flex">
        <TooltipProvider :delay-duration="120">
          <TooltipRoot>
            <TooltipTrigger as-child>
              <PopoverTrigger as-child>
                <slot />
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="top"
                :side-offset="6"
                class="z-50 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0"
              >
                {{ tooltip }}
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </TooltipProvider>
      </span>
    </PopoverAnchor>
    <PopoverTrigger v-else as-child>
      <slot />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side || 'bottom'"
        :align="align || 'start'"
        :side-offset="6"
        class="rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        :class="[props.raised ? 'z-[var(--z-assistant-modal)]' : 'z-50', props.wide ? 'w-[34rem] max-w-[calc(100vw-2rem)]' : 'w-72']"
        @pointer-down-outside="keepOpen"
        @focus-outside="keepOpen"
      >
        <slot name="content" />
        <PopoverArrow class="fill-aruna-navy" :width="10" :height="4" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
