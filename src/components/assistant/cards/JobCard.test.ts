import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JobCard from './JobCard.vue'
import * as JobLive from '@/lib/assistant/jobLive'
import { clearLiveJobs, noteJob, setWatchedJobs } from '@/lib/assistant/jobLive'
import type { JobView } from '@/lib/assistant/types'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'
import * as UseNow from '@/composables/useNow'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const jobs = vi.hoisted(() => ({ getJob: vi.fn() }))
vi.mock('@/lib/jobs', () => jobs)

const Stub = { render: () => null }

async function render(view: JobView): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/buckets/:bucketId', name: 'bucket', component: Stub },
      { path: '/app/jobs/:jobId', name: 'job', component: Stub },
      { path: '/app/compute/:taskId', name: 'task', component: Stub },
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

afterEach(() => {
  clearLiveJobs()
  jobs.getJob.mockReset()
})

// The card mounted in the client renderer, so its mount hook runs.
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const LinkStub = defineComponent({ setup: (_, { slots }) => () => h('a', {}, slots.default?.()) })
const ClientCard = compileClientComponent(new URL('./JobCard.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/CopyButton.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Passthrough),
  '@/components/assistant/ObjectLink.vue': moduleDefault(LinkStub),
  '@/composables/aruna/state': { apiBaseUrl: ref('https://node.test'), authToken: ref('token') },
  '@/composables/useNow': UseNow,
  '@/lib/assistant/jobLive': JobLive,
  '@/lib/jobs': jobs,
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

async function mount(view: JobView): Promise<string> {
  const { root } = await mountApp(ClientCard, { props: { view } })
  await flush()
  return content(root)
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

  it('shortens both ids, keeps them whole, and links the run page', async () => {
    const markup = await render(succeeded)

    expect(markup).toContain('01M1NXNB…3D870')
    expect(markup).toContain('b59346e5…740a2')
    expect(markup).toContain(`title="${NODE}"`)
    expect(markup).toContain('href="/app/compute/01M1NXNBTN00030969DSD3D870"')
    expect(markup).not.toContain(`>${NODE}<`)
  })

  it('links a system job to the jobs page', async () => {
    const markup = await render({ ...succeeded, jobKind: 'import_rocrate' })

    expect(markup).toContain('href="/app/jobs/01M1NXNBTN00030969DSD3D870"')
  })

  it('spins while a watcher follows the job', async () => {
    // A card drawn at submission must show the state the watcher last polled.
    setWatchedJobs([succeeded.jobId])
    noteJob(succeeded.jobId, { state: 'running', kind: 'execution', attempts: 2 })
    const markup = await render({ ...succeeded, state: 'queued' })

    expect(markup).toContain('Running')
    expect(markup).toContain('Following this job')
    expect(markup).toContain('2 attempts')
    expect(markup).not.toContain('Queued')
  })

  it('stops spinning once the watched job settles', async () => {
    setWatchedJobs([succeeded.jobId])
    noteJob(succeeded.jobId, { state: 'failed', kind: 'execution', error: 'exit code 2' })
    const markup = await render({ ...succeeded, state: 'running' })

    expect(markup).toContain('Failed')
    expect(markup).toContain('exit code 2')
    expect(markup).not.toContain('Following this job')
  })

  it('keeps the polled facts after the watch ended', async () => {
    // The watch is gone once the job settled; what it last read must stay.
    noteJob(succeeded.jobId, { state: 'succeeded', kind: 'execution' })
    setWatchedJobs([])
    const markup = await render({ ...succeeded, state: 'running' })

    expect(markup).toContain('Succeeded')
    expect(markup).not.toContain('Following this job')
  })

  it('reads the job once when a stale card mounts', async () => {
    jobs.getJob.mockResolvedValue({ state: 'succeeded', kind: 'execution', attempts: 1 })

    const text = await mount({ ...succeeded, state: 'running' })

    expect(jobs.getJob).toHaveBeenCalledTimes(1)
    expect(jobs.getJob).toHaveBeenCalledWith(succeeded.jobId, { baseUrl: 'https://node.test', token: 'token' })
    expect(text).toContain('Succeeded')
    expect(text).not.toContain('Running')
  })

  it('leaves a settled or already polled card alone', async () => {
    await mount(succeeded)
    noteJob('job-live', { state: 'running' })
    await mount({ ...succeeded, jobId: 'job-live', state: 'queued' })

    expect(jobs.getJob).not.toHaveBeenCalled()
  })

  it('keeps the stored facts when the read fails', async () => {
    jobs.getJob.mockRejectedValue(new Error('offline'))

    const text = await mount({ ...succeeded, state: 'running' })

    expect(text).toContain('Running')
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
