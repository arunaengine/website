import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'
import { providePageContext, usePageContext } from './usePageContext'
import type { PageContext } from '@/lib/assistant/prompt'

function dataset(title: string): PageContext {
  return { kind: 'dataset', title, details: {} }
}

describe('usePageContext', () => {
  it('reads the registered view and clears it when the view goes away', () => {
    const { currentPage } = usePageContext()
    expect(currentPage()).toBeNull()

    const scope = effectScope()
    scope.run(() => providePageContext(() => dataset('Water quality')))
    expect(currentPage()?.title).toBe('Water quality')

    scope.stop()
    expect(currentPage()).toBeNull()
  })

  it('keeps the newer view when an older scope is disposed after it', () => {
    // Navigating mounts the next view before the previous one is torn down.
    const { currentPage } = usePageContext()
    const first = effectScope()
    const second = effectScope()
    first.run(() => providePageContext(() => dataset('First')))
    second.run(() => providePageContext(() => dataset('Second')))

    first.stop()
    expect(currentPage()?.title).toBe('Second')

    second.stop()
    expect(currentPage()).toBeNull()
  })
})
