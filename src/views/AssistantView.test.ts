import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./AssistantView.vue', import.meta.url)), 'utf8')
const template = parse(source, { filename: 'AssistantView.vue' }).descriptor.template?.content ?? ''

describe('assistant history availability', () => {
  it('keeps scoped history visible when providers are unavailable', () => {
    expect(template).toContain('<div v-if="!available"')
    expect(template).toContain('<div v-if="historyReady"')
    expect(template).toContain('<AssistantHistory :read-only="!available" />')
    expect(template).toContain('<div v-if="available && historyReady"')
  })
})
