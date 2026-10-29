import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { Download } from '@lucide/vue'
import StatusMark from './StatusMark.vue'
import StatusPill from './StatusPill.vue'

const render = (component: unknown, props: Record<string, unknown>) => renderToString(createSSRApp({ render: () => h(component as never, props) }))

describe('status display', () => {
  it('marks a fine state with a green check and the word only for tooltip and assistive tech', async () => {
    const html = await render(StatusMark, { label: 'Online' })
    expect(html).toContain('lucide-circle-check')
    expect(html).toContain('text-status-ok')
    expect(html).toContain('aria-label="Online"')
    expect(html.replace(/<[^>]+>/g, '').trim()).toBe('')
  })

  it('shows a state that needs attention as icon and word in one pill, without a dot', async () => {
    const running = await render(StatusPill, { state: 'running' })
    expect(running).toContain('h-[22px]')
    expect(running).toContain('text-status-running')
    expect(running).toContain('lucide-loader-circle')
    expect(running.replace(/<[^>]+>/g, '').trim()).toBe('running')
    expect(running).not.toContain('rounded-full bg-')

    expect(await render(StatusPill, { state: 'failed' })).toContain('text-status-failed')
    expect(await render(StatusPill, { state: 'offline' })).toContain('lucide-triangle-alert')
    expect(await render(StatusPill, { state: 'degraded', tone: 'attention' })).toContain('text-status-warn')
  })

  it('takes the icon of what runs, such as an import', async () => {
    const html = await render(StatusPill, { state: 'Importing, 1 job', tone: 'progress', icon: Download })
    expect(html).toContain('lucide-download')
    expect(html).not.toContain('animate-spin')
  })
})
