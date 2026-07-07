import { ref } from 'vue'

export interface GlobalError {
  id: number
  message: string
}

const errors = ref<GlobalError[]>([])
let nextId = 1

export function reportGlobalError(message: string) {
  // De-duplicate identical messages so repeated failures do not stack up.
  if (errors.value.some((e) => e.message === message)) return
  errors.value = [...errors.value, { id: nextId++, message }]
}

export function dismissGlobalError(id: number) {
  errors.value = errors.value.filter((e) => e.id !== id)
}

export function useGlobalErrors() {
  return { errors, reportGlobalError, dismissGlobalError }
}
