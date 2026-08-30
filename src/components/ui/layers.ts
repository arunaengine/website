// A suggestion list is portaled to the body so it can float over a dialog or a
// popover; a pick inside it must not read as an interaction outside that layer.
export function insidePortalList(event: Event): boolean {
  const target = (event as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent?.target
  return target instanceof Element && Boolean(target.closest('[data-portal-list]'))
}
