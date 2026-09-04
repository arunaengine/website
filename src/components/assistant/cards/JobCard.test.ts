import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import JobCard from './JobCard.vue'
import type { JobView } from '@/lib/assistant/types'

const Stub = { render: () => null }

async function render(view: JobView): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/buckets/:bucketId', name: 'bucket', component: Stub },
      { path: '/app/jobs/:jobId', name: 'job', component: Stub },
      { path: '/:rest(.*)', component: Stub },
    ],
  })
  const app = createSSRApp({ render: () => h(JobCard, { view }) })
  app.use(router)
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

const NODE = 'b59346e577468dc9710076a7c483fccc1c2fea2ac41dc484baa5012c21c740a2'

const succeeded: JobView = {
  kind: 'job',
  title: 'gc analysis',
  jobId: '01M1NXNBTN00030969DSD3D870',
  state: 'succeeded',
  jobKind: 'execution',
  submittedAt: new Date(Date.now() - 120_000).toISOString(),
  finishedAt: new Date(Date.now() - 60_000).toISOString(),
  nodeId: NODE,
  attempts: 1,
  outputs: [{ bucket: 'lorem', key: 'results/gc_analysis_rerun.json', size: 82 }],
}

describe('JobCard', () => {
  it('shows the state and links every output into the data browser', async () => {
    const markup = await render(succeeded)

    expect(markup).toContain('gc analysis')
    expect(markup).toContain('Succeeded')
    expect(markup).toContain('Submitted')
    expect(markup).toContain('href="/app/buckets/lorem?prefix=results&amp;object=results%2Fgc_analysis_rerun.json"')
    expect(markup).toContain('1 output')
  })

  it('shortens both ids, keeps them whole, and links the job page', async () => {
    const markup = await render(succeeded)

    expect(markup).toContain('01M1NXNB…3D870')
    expect(markup).toContain('b59346e5…740a2')
    expect(markup).toContain(`title="${NODE}"`)
    expect(markup).toContain('href="/app/jobs/01M1NXNBTN00030969DSD3D870"')
    expect(markup).not.toContain(`>${NODE}<`)
  })

  it('names repeated attempts and stays quiet about the first', async () => {
    expect(await render(succeeded)).not.toContain('attempt')
    expect(await render({ ...succeeded, attempts: 3 })).toContain('3 attempts')
  })

  it('shows a failed job with its error and no output list', async () => {
    const markup = await render({
      kind: 'job',
      title: 'Job job-9',
      jobId: 'job-9',
      state: 'failed',
      error: 'exit code 1',
      outputs: [],
    })

    expect(markup).toContain('Failed')
    expect(markup).toContain('exit code 1')
    expect(markup).not.toContain('outputs')
  })
})
