// A second sign-in runs in a popup that returns to this website. Its callback goes to the
// waiting portal tab before this page boots, since the provider's page cut the opener link.

/** Marks the state of a popup sign-in. */
export const POPUP_STATE_PREFIX = 'popup.'
/** The channel a popup callback travels on; the code is useless without the tab's verifier. */
export const POPUP_CHANNEL = 'aruna.popup-sign-in'

function element(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

/** Hands a popup callback to the waiting tab and closes; false for any other page. */
export function handOffPopup(): boolean {
  const { pathname, search } = window.location
  const state = new URLSearchParams(search).get('state')
  if (pathname !== '/auth/callback' || !state?.startsWith(POPUP_STATE_PREFIX)) return false

  const channel = new BroadcastChannel(POPUP_CHANNEL)
  channel.postMessage({ search })
  channel.close()
  const surface = element('div', 'surface p-8')
  surface.append(
    element('h1', 'font-display text-base font-semibold text-foreground', 'Sign-in done'),
    element('p', 'mt-2 text-sm text-muted-foreground', 'You can close this window.'),
  )
  const column = element('div', 'w-full max-w-md text-center')
  column.append(surface)
  const page = element('div', 'flex min-h-full items-center justify-center bg-background px-4')
  page.append(column)
  document.getElementById('app')?.replaceChildren(page)
  window.close()
  return true
}
