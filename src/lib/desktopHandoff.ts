// The realm website is Aruna Desktop's sign-in callback too. A state the app
// marked is handed on before the portal boots, as that boot uses storage.
import { buttonVariants } from '@/components/ui/button'

// The shell's own origin is tauri://localhost, which no IdP accepts, so the
// desktop default is the custom scheme it registers and routes (RFC 8252).
export const DESKTOP_CALLBACK_URI = 'aruna://auth/callback'

/** Marks a desktop state, so the realm website hands its callback on to the app. */
export const DESKTOP_STATE_PREFIX = 'desktop.'

function element(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

/** Hands a marked callback on to the app and says so; false for any other page. */
export function handOffDesktop(): boolean {
  // Same test as the portal's desktop detection: a malformed global is absent.
  const shell = window.__ARUNA_DESKTOP__
  if (shell && typeof shell === 'object' && !Array.isArray(shell)) return false
  const { pathname, search, hash } = window.location
  const state = new URLSearchParams(search).get('state')
  if (pathname !== '/auth/callback' || !state?.startsWith(DESKTOP_STATE_PREFIX)) return false

  const target = `${DESKTOP_CALLBACK_URI}${search}${hash}`
  window.location.replace(target)
  const link = element('a', buttonVariants(), 'Open Aruna Desktop') as HTMLAnchorElement
  link.href = target
  const actions = element('div', 'mt-6 flex justify-center')
  actions.append(link)
  const surface = element('div', 'surface p-8')
  surface.append(
    element('h1', 'font-display text-base font-semibold text-foreground', 'Continue in Aruna Desktop'),
    element('p', 'mt-2 text-sm text-muted-foreground', 'Your sign-in is done. Aruna Desktop completes it.'),
    actions,
    element('p', 'mt-4 text-xs text-muted-foreground', 'You can close this window afterwards.'),
  )
  const column = element('div', 'w-full max-w-md text-center')
  column.append(surface)
  const page = element('div', 'flex min-h-full items-center justify-center bg-background px-4')
  page.append(column)
  document.getElementById('app')?.replaceChildren(page)
  return true
}
