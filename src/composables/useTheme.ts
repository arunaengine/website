import { computed, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'aruna.theme'

function readInitialMode(): ThemeMode {
  // Dark is the brand default; 'system' and 'light' remain opt-in.
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark'
}

const mode = ref<ThemeMode>(readInitialMode())
const systemDark = ref(false)
let initialized = false

const resolved = computed<'light' | 'dark'>(() =>
  mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value,
)
const isDark = computed(() => resolved.value === 'dark')

function applyTheme() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolved.value === 'dark')
  document.documentElement.style.colorScheme = resolved.value
}

function initialize() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  const updateSystem = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches
    applyTheme()
  }

  media.addEventListener('change', updateSystem)
  watch(
    [mode, systemDark],
    () => {
      window.localStorage.setItem(STORAGE_KEY, mode.value)
      applyTheme()
    },
    { immediate: true },
  )
}

export function useTheme() {
  initialize()

  return {
    mode,
    resolved,
    isDark,
    setTheme(next: ThemeMode) {
      mode.value = next
    },
    toggleTheme() {
      mode.value = isDark.value ? 'light' : 'dark'
    },
  }
}
