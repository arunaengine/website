import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ListPager from './ListPager.vue'

async function text(props: { page: number; pageSize: number; total: number }) {
  const html = await renderToString(createSSRApp(ListPager, props))
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('ListPager', () => {
  it('names the shown range of the whole list', async () => {
    expect(await text({ page: 1, pageSize: 10, total: 33 })).toContain('1-10 of 33')
    expect(await text({ page: 4, pageSize: 10, total: 33 })).toContain('31-33 of 33')
    expect(await text({ page: 1, pageSize: 10, total: 1250 })).toContain('1-10 of 1,250')
  })
})
