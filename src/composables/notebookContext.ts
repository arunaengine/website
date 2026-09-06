// The open notebook and its session, shared with the parts of the page. Only
// the notebook view provides it, so nothing else reaches into the document.
import { inject, provide, type InjectionKey } from 'vue'
import type { NotebookStore } from './useNotebook'
import type { NotebookSessionStore } from './useNotebookSession'

export interface NotebookContext {
  notebook: NotebookStore
  session: NotebookSessionStore
}

export const NOTEBOOK: InjectionKey<NotebookContext> = Symbol('aruna.notebook')

export function provideNotebook(context: NotebookContext): void {
  provide(NOTEBOOK, context)
}

export function injectNotebook(): NotebookContext {
  const context = inject(NOTEBOOK)
  if (!context) throw new Error('The notebook is only available inside the notebook page.')
  return context
}
