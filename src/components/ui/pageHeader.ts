import type { InjectionKey } from 'vue'

/** Set inside a page header, whose actions are 32 px icon buttons with tooltips. */
export const IN_PAGE_HEADER: InjectionKey<boolean> = Symbol.for('in page header')
