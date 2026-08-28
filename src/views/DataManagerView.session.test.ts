import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dataManager = readFileSync(
  fileURLToPath(new URL('./DataManagerView.vue', import.meta.url)),
  'utf8',
)
const objectBrowser = readFileSync(
  fileURLToPath(new URL('../components/data/ObjectBrowserPanel.vue', import.meta.url)),
  'utf8',
)
const managerBrowser = readFileSync(
  fileURLToPath(new URL('../components/data/manager/ObjectBrowser.vue', import.meta.url)),
  'utf8',
)
const uploadPanel = readFileSync(
  fileURLToPath(new URL('../components/data/manager/UploadPanel.vue', import.meta.url)),
  'utf8',
)
const credentialDialog = readFileSync(
  fileURLToPath(new URL('../components/data/CreateCredentialDialog.vue', import.meta.url)),
  'utf8',
)

describe('Data view session affordances', () => {
  it('has no manual or long-lived browser credential activation path', () => {
    for (const source of [dataManager, managerBrowser, uploadPanel]) {
      expect(source).not.toContain('CreateCredentialDialog')
      expect(source).not.toContain('manualKey')
      expect(source).not.toContain('setActiveKey')
    }
    expect(credentialDialog).not.toContain('Use in browser')
    expect(credentialDialog).not.toContain('setActiveKey')
    expect(credentialDialog).toContain('The portal never stores or uses this key.')
  })

  it('disables write, upload, and delete affordances from session restrictions', () => {
    expect(managerBrowser).toContain(':disabled="!canWriteCurrentPrefix"')
    expect(managerBrowser).toContain(':disabled="!s3.canWrite(bucket, object.key, remoteNodeId)"')
    expect(managerBrowser).toContain(':disabled="!s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId)"')
    expect(uploadPanel).toContain(':disabled="!canWriteCurrentPrefix"')
    expect(uploadPanel).toContain('Uploads are unavailable for')
    expect(managerBrowser).toContain('This session is read-only')
  })

  it('offers a way out when no group is selected', () => {
    expect(dataManager).toContain('Select a group above.')
    expect(dataManager).toContain("<RouterLink :to=\"{ name: 'groups' }\">Create or join a group</RouterLink>")
  })

  it('blocks wrong-node browsing and names both node scopes before switching', () => {
    expect(objectBrowser).toContain('v-if="contextMismatch"')
    expect(objectBrowser).toContain('contextMismatch.issuerNodeId')
    expect(objectBrowser).toContain('contextMismatch.requiredNodeId')
    expect(objectBrowser).toContain('Browsing and selection stay disabled')
    expect(objectBrowser).toContain('Open on this node')
    expect(objectBrowser).toContain(':disabled="switchBusy || !s3.activeContext.value?.groupId"')
  })
})
