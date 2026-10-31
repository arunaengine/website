import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computeTutorialSteps } from '@/lib/tutorial/steps/compute'
import { profileTutorialSteps } from '@/lib/tutorial/steps/profile'
import { docsTopicBySlug, docsTopics, sectionId, type DocsTopic } from './v1'

const sourceRoot = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

const sources = sourceFiles(sourceRoot).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

function topicCopy(topic: DocsTopic): string[] {
  return topic.sections.flatMap((section) => [
    ...(section.paragraphs ?? []),
    ...(section.bullets ?? []),
    ...(section.steps ?? []),
    ...(section.table?.rows ?? []).flat(),
  ])
}

function sectionExists(slug: string, title?: string): boolean {
  const topic = docsTopicBySlug(slug)
  if (!topic) return false
  return !title || topic.sections.some((section) => section.title === title)
}

describe('docs links', () => {
  it('points every concept link at a topic and section that exist', () => {
    const allTopics = [...docsTopics, docsTopicBySlug('glossary')].filter(Boolean) as DocsTopic[]
    for (const topic of allTopics) {
      for (const text of topicCopy(topic)) {
        for (const match of text.matchAll(/\]\(concept:([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/g)) {
          const target = docsTopicBySlug(match[1])
          expect(target, `${topic.slug}: ${match[0]}`).toBeDefined()
          if (match[2]) {
            const anchors = target?.sections.map((section) => sectionId(section.title)) ?? []
            expect(anchors, `${topic.slug}: ${match[0]}`).toContain(match[2])
          }
        }
      }
    }
  })

  it('points every page link at a portal route docs may link', () => {
    const routes = readFileSync(join(sourceRoot, 'router/routes.ts'), 'utf8')
    for (const text of docsTopics.flatMap(topicCopy)) {
      for (const match of text.matchAll(/\]\((page:[^)]+|[a-z]+:[^)]*)\)/g)) {
        const target = match[1]
        if (!target.startsWith('page:')) {
          expect(target, match[0]).toMatch(/^(concept:|api:reference$|https:\/\/)/)
          continue
        }
        expect(routes, match[0]).toContain(`name: '${target.slice('page:'.length)}'`)
      }
    }
  })

  it('names a docs section that exists in every DocsLink and page header', () => {
    let checked = 0
    for (const { path, text } of sources) {
      const tags = [...text.matchAll(/<DocsLink\b[^>]*>/gs)].map((match) => match[0])
      for (const tag of tags) {
        const topic = /\stopic="([^"]+)"/.exec(tag)?.[1]
        if (!topic) continue
        const section = /\ssection="([^"]+)"/.exec(tag)?.[1]
        expect(sectionExists(topic, section), `${path}: ${tag}`).toBe(true)
        checked += 1
      }
      for (const match of text.matchAll(/topic: '([a-z0-9-]+)'(?:, section: '([^']+)')?/g)) {
        expect(sectionExists(match[1], match[2]), `${path}: ${match[0]}`).toBe(true)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('points every tutorial step at a rendered data-tutorial target', () => {
    const rendered = new Set<string>()
    for (const { text } of sources) {
      for (const match of text.matchAll(/data-tutorial="([a-z0-9-]+)"/g)) rendered.add(match[1])
    }
    for (const step of [...computeTutorialSteps, ...profileTutorialSteps]) {
      expect(rendered.has(step.target), `${step.id}: ${step.target}`).toBe(true)
    }
  })
})
