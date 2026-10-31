import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import OptionToggle from './OptionToggle.vue'

describe('OptionToggle', () => {
  it('picks an option inside a form without submitting it', async () => {
    const options = [
      { value: 'read', label: 'Read only' },
      { value: 'read_upload', label: 'Read and write' },
    ]
    const html = await renderToString(createSSRApp(OptionToggle, { modelValue: 'read', options }))
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) expect(button).toContain('type="button"')
  })
})
