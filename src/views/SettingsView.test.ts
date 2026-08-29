import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { baseParse, NodeTypes } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

interface AstNode {
  type: number
  tag?: string
  props?: Array<{
    type: number
    name?: string
    value?: { content: string }
  }>
  children?: AstNode[]
  loc: { source: string }
}

const source = readFileSync(fileURLToPath(new URL('./SettingsView.vue', import.meta.url)), 'utf8')
const parsed = parse(source, { filename: 'SettingsView.vue' })
if (parsed.errors.length) throw parsed.errors[0]
if (!parsed.descriptor.template) throw new Error('SettingsView.vue has no template')
const root = baseParse(parsed.descriptor.template.content) as unknown as AstNode

function staticAttribute(node: AstNode, name: string): string | undefined {
  return node.props?.find((prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === name)?.value?.content
}

function classTokens(node: AstNode): string[] {
  return staticAttribute(node, 'class')?.split(/\s+/) ?? []
}

function findElementPath(
  node: AstNode,
  predicate: (candidate: AstNode) => boolean,
  ancestors: AstNode[] = [],
): AstNode[] | undefined {
  const path = node.type === NodeTypes.ELEMENT ? [...ancestors, node] : ancestors
  if (node.type === NodeTypes.ELEMENT && predicate(node)) return path
  for (const child of node.children ?? []) {
    const match = findElementPath(child, predicate, path)
    if (match) return match
  }
  return undefined
}

function collectElements(node: AstNode, predicate: (candidate: AstNode) => boolean): AstNode[] {
  const matches: AstNode[] = []
  if (node.type === NodeTypes.ELEMENT && predicate(node)) matches.push(node)
  for (const child of node.children ?? []) matches.push(...collectElements(child, predicate))
  return matches
}

describe('SettingsView responsive geometry', () => {
  it('does not contain the removed placeholder control or identifiers', () => {
    const removedLabel = ['Hide sensitive', 'hashes by default'].join(' ')
    const removedCopy = ['Hash display controls', 'are local UI-only preferences.'].join(' ')
    const removedIdentifierParts = [
      ['hide', 'sensitive', 'hash'],
      ['hash', 'preference'],
      ['preferences', 'hash'],
    ]

    expect(source).not.toContain(removedLabel)
    expect(source).not.toContain(removedCopy)
    for (const parts of removedIdentifierParts) expect(source).not.toMatch(new RegExp(parts.join('[._-]?'), 'i'))
    expect(source).not.toContain("@/components/ui/Switch.vue")
    expect(collectElements(root, (node) => node.tag === 'Switch')).toHaveLength(0)
  })

  it('offers every settings section as a shareable tab', () => {
    const tabIds = ['profile', 'groups', 'access', 'sessions', 'connection', 'appearance']
    const tabList = source.match(/const settingsTabs = \[([\s\S]*?)\] as const/)?.[1] ?? ''
    const declaredIds = Array.from(tabList.matchAll(/\{ id: '([^']+)'/g), (match) => match[1])
    const panelIds = collectElements(root, (node) => node.tag === 'TabsContent')
      .map((node) => staticAttribute(node, 'value'))
      .filter((id): id is string => Boolean(id))

    expect(declaredIds).toEqual(tabIds)
    expect(panelIds.sort()).toEqual([...tabIds].sort())
    // Tabs live in ?tab= so a section is a link a person can share or reload into.
    expect(source).toContain("useRouteTab(\n  settingsTabs.map((entry) => entry.id),\n  'profile',\n)")
    expect(source).not.toContain('settingsSections')
    expect(source).not.toContain('onMobileTabsKeydown')
  })

  it('keeps the tab row scrollable and drops the anchored submenu', () => {
    const listPath = findElementPath(
      root,
      (node) => node.tag === 'TabsList' && staticAttribute(node, 'aria-label') === 'Settings sections',
    )
    expect(listPath).toBeDefined()
    expect(listPath?.some((node) => classTokens(node).includes('overflow-x-auto'))).toBe(true)
    expect(collectElements(root, (node) => node.tag === 'TabsTrigger')).toHaveLength(1)
    expect(source).not.toContain('@4xl:grid-cols-[260px_1fr]')
    expect(source).not.toContain('lg:grid-cols-[260px_1fr]')
    expect(source).not.toContain('scroll-mt-20')
  })

  it('keeps the watched resources page reachable from the settings header', () => {
    expect(source).toContain("{ name: 'settings-watches' }")
    expect(source).toContain('Watched resources')
  })

  it('places the credentials table inside a horizontal overflow boundary', () => {
    const tablePath = findElementPath(root, (node) => node.tag === 'table')
    expect(tablePath).toBeDefined()
    const tableParent = tablePath?.at(-2)
    const credentialsSection = tablePath?.find((node) => node.tag === 'section')

    expect(tableParent?.tag).toBe('div')
    expect(classTokens(tableParent!)).toEqual(expect.arrayContaining(['min-w-0', 'overflow-x-auto']))
    expect(classTokens(credentialsSection!)).toContain('overflow-hidden')
  })
})
