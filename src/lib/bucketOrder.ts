// A user's own order of a group's buckets, stored as the comma-separated bucket names of the
// user attribute `ui.bucket_order.<group id>`. Buckets not in it follow in the default order.

export const ORDER_PREFIX = 'ui.bucket_order.'
/** The node refuses user attribute values longer than this (ATTRIBUTE_VALUE_BYTES). */
export const ORDER_VALUE_BYTES = 4096

export function parseOrder(value: string | null | undefined): string[] {
  const names = (value ?? '').split(',').map((name) => name.trim()).filter(Boolean)
  return [...new Set(names)]
}

/** The names that fit one attribute value; the rest fall back to the default order. */
export function encodeOrder(names: readonly string[]): string {
  let value = ''
  for (const name of names) {
    const next = value ? `${value},${name}` : name
    if (new TextEncoder().encode(next).length > ORDER_VALUE_BYTES) break
    value = next
  }
  return value
}

/** Compares two names by their place in the order; names not in it come last, as equals. */
export function orderCompare(order: readonly string[]): (a: string, b: string) => number {
  const rank = new Map(order.map((name, index) => [name, index]))
  const of = (name: string) => rank.get(name) ?? Number.MAX_SAFE_INTEGER
  return (a, b) => of(a) - of(b)
}

/**
 * The order after moving `name` to the place of `target`, as the list `shown` displays them.
 * Shown names not yet in the order join it in their shown order first.
 */
export function moveBucket(order: readonly string[], shown: readonly string[], name: string, target: string): string[] {
  const full = [...new Set([...order, ...shown])]
  const from = full.indexOf(name)
  const to = full.indexOf(target)
  if (from < 0 || to < 0 || from === to) return full
  full.splice(from, 1)
  full.splice(full.indexOf(target) + (from < to ? 1 : 0), 0, name)
  return full
}
