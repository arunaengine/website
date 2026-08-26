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

  it('renders every Settings section anchor in one narrow-container tab row', () => {
    const sectionIds = ['connection', 'profile', 'default-profile', 'groups', 'credentials', 'devices', 'interop', 'appearance']
    const sectionList = source.match(/const settingsSections = \[([\s\S]*?)\] as const/)?.[1] ?? ''
    const renderedIds = Array.from(sectionList.matchAll(/\{ id: '([^']+)'/g), (match) => match[1])
    const targetIds = collectElements(root, (node) => node.tag === 'section')
      .map((node) => staticAttribute(node, 'id'))
      .filter((id): id is string => Boolean(id))

    const navPath = findElementPath(root, (node) => node.tag === 'nav' && staticAttribute(node, 'aria-label') === 'Settings sections')
    expect(navPath).toBeDefined()
    const nav = navPath?.at(-1)
    expect(nav).toBeDefined()
    expect(classTokens(nav!)).toContain('overflow-x-auto')
    expect(navPath?.some((node) => classTokens(node).includes('@4xl:hidden'))).toBe(true)
    expect(nav?.loc.source).toContain('v-for="section in settingsSections"')
    expect(nav?.loc.source).toContain(`:href="'#' + section.id"`)
    expect(nav?.loc.source).toContain('@keydown="onMobileTabsKeydown"')
    expect(nav?.loc.source).not.toContain('tabindex="-1"')
    expect(renderedIds).toEqual(sectionIds)
    expect(targetIds).toEqual(expect.arrayContaining(sectionIds))
    for (const sectionId of sectionIds) {
      const target = collectElements(root, (node) => staticAttribute(node, 'id') === sectionId)[0]
      expect(classTokens(target)).toContain('scroll-mt-20')
    }
  })

  it('switches the submenu on the content container instead of the viewport', () => {
    const shell = collectElements(root, (node) => classTokens(node).includes('@container'))
    const grid = collectElements(root, (node) => classTokens(node).includes('@4xl:grid-cols-[260px_1fr]'))
    const sideNav = collectElements(root, (node) => node.tag === 'nav' && classTokens(node).includes('@4xl:flex'))

    expect(shell).toHaveLength(1)
    expect(grid).toHaveLength(1)
    expect(sideNav).toHaveLength(1)
    // A container query cannot read its own container, so the grid must be nested.
    expect(shell[0]).not.toBe(grid[0])
    expect(source).not.toContain('lg:grid-cols-[260px_1fr]')
  })

  it('places the credentials table inside a horizontal overflow boundary', () => {
    const tablePath = findElementPath(root, (node) => node.tag === 'table')
    expect(tablePath).toBeDefined()
    const tableParent = tablePath?.at(-2)
    const credentialsSection = tablePath?.find(
      (node) => node.tag === 'section' && staticAttribute(node, 'id') === 'credentials',
    )

    expect(tableParent?.tag).toBe('div')
    expect(classTokens(tableParent!)).toEqual(expect.arrayContaining(['min-w-0', 'overflow-x-auto']))
    expect(classTokens(credentialsSection!)).toContain('overflow-hidden')
  })
})
