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
    // The row's one destructive entry carries the reason, not just a state.
    expect(managerBrowser).toContain(':disabled-reason="objectReason(object.key)"')
    expect(managerBrowser).toContain(':disabled-reason="folderReason(folder.prefix)"')
    expect(managerBrowser).toContain('This session cannot delete this object.')
    expect(managerBrowser).toContain('This session cannot delete this entire folder.')
    expect(uploadPanel).toContain(':disabled="!canWriteCurrentPrefix"')
    expect(uploadPanel).toContain('Uploads are unavailable for')
    expect(managerBrowser).toContain('This session is read-only')
  })

  it('offers a way out without a group membership', () => {
    expect(dataManager).toContain('Join a group to browse data')
    expect(dataManager).toContain("<RouterLink :to=\"{ name: 'groups' }\">Create or join a group</RouterLink>")
  })

  it('browses only with a session of the required node', () => {
    // The dialog browser opens the required node's own session instead of
    // offering a switch button; a wrong-node session never lists anything.
    expect(objectBrowser).toContain('context.nodeId === requiredNodeId.value')
    expect(objectBrowser).toContain('s3.activateContext(props.nodeId ?? null, selectedGroupId.value)')
    expect(objectBrowser).toContain('const canBrowse = computed(() => contextReady.value && Boolean(effectiveEndpoint.value))')
    expect(objectBrowser).not.toContain('Open on this node')
    expect(objectBrowser).not.toContain('Open group')
  })
})
