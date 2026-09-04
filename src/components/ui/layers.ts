// Two things float above a dialog: a suggestion list portaled to the body, and
// the assistant panel (z-assistant). A pointer or focus event inside either is
// not an interaction outside the dialog, so the dialog must stay open.
import { onBeforeUnmount, onMounted } from 'vue'

const FLOATING = '[data-portal-list], [data-assistant-layer]'
const ASSISTANT = '[data-assistant-layer]'

function inside(node: unknown, query: string): boolean {
  return node instanceof Element && Boolean(node.closest(query))
}

export function insideFloatingLayer(event: Event): boolean {
  const target = (event as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent?.target
  return inside(target, FLOATING)
}

/** True when a focus move hands focus to the assistant layer, or takes it there. */
export function focusEntersAssistant(event: FocusEvent): boolean {
  return inside(event.type === 'focusout' ? event.relatedTarget : event.target, ASSISTANT)
}

// Radix traps focus by watching focusin and focusout on the document. The
// assistant panel floats above the dialog and must stay typeable, so those two
// events are stopped in the capture phase; Escape and the trap elsewhere stay.
export function allowAssistantFocus(): void {
  if (typeof document === 'undefined') return
  const stop = (event: Event) => {
    if (focusEntersAssistant(event as FocusEvent)) event.stopPropagation()
  }
  onMounted(() => {
    document.addEventListener('focusin', stop, true)
    document.addEventListener('focusout', stop, true)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('focusin', stop, true)
    document.removeEventListener('focusout', stop, true)
  })
}
