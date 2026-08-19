import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./StatusView.vue', import.meta.url)), 'utf8')

describe('node outage presentation', () => {
  it('requires a failed browser probe instead of treating configured DHT state as an outage', () => {
    const predicate = source.match(/const unreachableNodes = computed\([\s\S]*?\n\)/)?.[0] ?? ''

    expect(predicate).toContain("probeFor(node)?.state === 'unreachable'")
    expect(predicate).not.toContain('node.configured')
    expect(predicate).not.toContain('connection_status')
    expect(source).toContain('The browser API probe failed')
    expect(source).toContain('present in DHT')
  })
})
