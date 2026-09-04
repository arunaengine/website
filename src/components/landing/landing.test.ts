import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ComputeSection from './ComputeSection.vue'
import FederationGraph from './FederationGraph.vue'
import RunAnywhereSection from './RunAnywhereSection.vue'

async function render(component: object): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(component) }))
}

describe('landing page pieces', () => {
  it('draws the three peers with their packets and says what the picture shows', async () => {
    const markup = await render(FederationGraph)

    expect(markup).toContain('Local machine')
    expect(markup).toContain('Research institute')
    expect(markup).toContain('Kubernetes cluster')
    expect(markup).toContain('data-from="k8s" data-to="institute"')
    expect(markup).toContain('role="img"')
    expect(markup).toContain('A compute job moves toward the dataset')
  })

  it('shows both compute directions as two nodes and a travelling packet', async () => {
    const markup = await render(ComputeSection)

    expect(markup).toContain('Data where it belongs. Compute where it makes sense.')
    expect(markup).toContain('data-from="compute" data-to="data"')
    expect(markup).toContain('data-from="data" data-to="compute"')
    expect(markup).toContain('>result<')
  })

  it('draws the same node at three sizes with the same five parts', async () => {
    const markup = await render(RunAnywhereSection)

    expect(markup).toContain('One system, not a fleet of services.')
    for (const title of ['Laptop', 'Lab server', 'Kubernetes cluster']) expect(markup).toContain(title)
    expect(markup.match(/Metadata/g)).toHaveLength(3)
  })
})
