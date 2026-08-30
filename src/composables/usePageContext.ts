// The open view lends the assistant a short description of what the user is
// looking at. Nothing else reaches into the view, and a turn sent from a page
// that registers nothing carries no page context at all.
import { onScopeDispose, shallowRef } from 'vue'
import type { PageContext } from '@/lib/assistant/prompt'

type PageSource = () => PageContext | null

const page = shallowRef<PageSource | null>(null)

/** Registers the open view for the life of the calling scope. */
export function providePageContext(source: PageSource): void {
  page.value = source
  onScopeDispose(() => {
    if (page.value === source) page.value = null
  })
}

export function usePageContext() {
  return { page, currentPage: (): PageContext | null => page.value?.() ?? null }
}
