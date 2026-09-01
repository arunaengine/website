// Two tab bindings on one query key silently fight: the inner setter writes a
// value the outer binding reads as its fallback, so picking an inner tab
// unmounts the inner component. This guard walks the import graph instead of
// waiting for the next screen to reproduce it.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Arguments of the call whose opening parenthesis sits at `open`. */
function callArguments(source: string, open: number): string[] {
  const args: string[] = ['']
  let depth = 0
  for (let at = open + 1; at < source.length; at += 1) {
    const character = source[at]
    if (character === ')' && depth === 0) return args.map((argument) => argument.trim()).filter(Boolean)
    if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    if (character === ',' && depth === 0) args.push('')
    else args[args.length - 1] += character
  }
  return args
}

/** Query key each `useRouteTab` call in the file binds; `tab` is the default. */
function boundKeys(source: string): string[] {
  const keys: string[] = []
  for (let at = source.indexOf('useRouteTab('); at >= 0; at = source.indexOf('useRouteTab(', at + 1)) {
    const third = callArguments(source, at + 'useRouteTab'.length)[2]
    const literal = third ? /^['"]([^'"]+)['"]$/.exec(third) : null
    keys.push(literal ? literal[1] : third ? `expression ${third}` : 'tab')
  }
  return keys
}

function importedComponents(path: string, source: string): string[] {
  return Array.from(source.matchAll(/from\s+['"]([^'"]+\.vue)['"]/g), (match) => {
    const specifier = match[1]
    return specifier.startsWith('@/')
      ? resolve(SRC, specifier.slice(2))
      : resolve(dirname(path), specifier)
  })
}

const components = new Map(
  vueFiles(SRC).map((path) => {
    const source = readFileSync(path, 'utf8')
    return [path, { keys: boundKeys(source), imports: importedComponents(path, source) }]
  }),
)

/** Every component reachable from `path` through .vue imports, itself aside. */
function descendants(path: string): string[] {
  const seen = new Set<string>()
  const queue = [...(components.get(path)?.imports ?? [])]
  while (queue.length) {
    const next = queue.shift()!
    if (seen.has(next) || !components.has(next)) continue
    seen.add(next)
    queue.push(...(components.get(next)?.imports ?? []))
  }
  seen.delete(path)
  return [...seen]
}

describe('route tab nesting', () => {
  it('never renders two bindings on one query key', () => {
    const collisions: string[] = []
    for (const [path, component] of components) {
      if (!component.keys.length) continue
      for (const child of descendants(path)) {
        const shared = components.get(child)!.keys.filter((key) => component.keys.includes(key))
        for (const key of shared) {
          collisions.push(`${relative(SRC, path)} renders ${relative(SRC, child)} on ?${key}=`)
        }
      }
    }
    expect(collisions).toEqual([])
  })

  it('sees the components that do bind a tab', () => {
    const binders = [...components].filter(([, component]) => component.keys.length)
    expect(binders.length).toBeGreaterThan(2)
  })
})
