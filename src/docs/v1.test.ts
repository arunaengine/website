import { describe, expect, it } from 'vitest'
import { RENDER_TOOL_NAMES } from '@/lib/assistant/renderTools'
import { docsTopicBySlug } from './v1'

function topicText(slug: string): string {
  const topic = docsTopicBySlug(slug)
  return (topic?.sections ?? [])
    .flatMap((section) => [...(section.paragraphs ?? []), ...(section.bullets ?? []), ...(section.steps ?? [])])
    .join('\n')
}

describe('assistant docs', () => {
  it('describes every card the assistant can draw', () => {
    // The docs are the reference list, so a new render tool must appear there.
    const copy = topicText('assistant')

    for (const name of RENDER_TOOL_NAMES) expect(copy).toContain(name)
  })
})
