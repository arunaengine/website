// The assistant surfaces lend the conversation a way to open a stored object
// over the chat. Without one, an object link routes to the data browser as
// before, which is what happens outside the assistant.
import { inject, onScopeDispose, shallowRef } from 'vue'
import { routerKey } from 'vue-router'

/** One stored object a link in the conversation asks to open. */
export interface ObjectTarget {
  bucket: string
  key: string
  name?: string
  size?: number
  nodeId?: string | null
}

type ObjectOpener = (target: ObjectTarget) => void

const opener = shallowRef<ObjectOpener | null>(null)
const leaving = shallowRef<(() => void) | null>(null)

// Registers the open-in-place handler for the life of the calling scope: the
// page takes over from the panel while open and hands it back on the way out.
export function provideObjectOpener(next: ObjectOpener): void {
  const previous = opener.value
  opener.value = next
  onScopeDispose(() => {
    if (opener.value === next) opener.value = previous
  })
}

// Registers what a surface does when a link navigates away. The assistant page
// shows the panel so the chat comes along; the panel itself registers nothing.
export function provideLeaveHandler(next: () => void): void {
  const previous = leaving.value
  leaving.value = next
  onScopeDispose(() => {
    if (leaving.value === next) leaving.value = previous
  })
}

export function useAssistantObject() {
  const router = inject(routerKey, null)
  const leave = () => leaving.value?.()

  // A plain click opens the object over the chat where a surface offers that
  // and routes to the data browser otherwise; a modified click or another
  // button is left to the browser, which follows the href.
  function follow(event: MouseEvent, href: string, target?: ObjectTarget) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return
    if (target && opener.value) {
      event.preventDefault()
      opener.value(target)
    } else if (router) {
      event.preventDefault()
      leave()
      void router.push(href)
    }
  }

  return { opener, leave, follow }
}
