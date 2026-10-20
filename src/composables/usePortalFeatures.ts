// Which portal features this user sees. Realm defaults load once per session and
// user; the user's own choices are the ui.feature.<key> attributes.
import { effectScope, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { getPortalFeatures, setPortalFeatures } from '@/lib/api'
import { featureAttribute, featureShown, ownChoice, type PortalFeature } from '@/lib/features'
import { errorMessage } from '@/lib/utils'

const realmDefaults = ref<Record<string, boolean>>({})
const defaultsLoading = ref(false)
// Optimistic own choices while the PATCH runs; null stands for the realm default.
const pending = ref<Partial<Record<PortalFeature, boolean | null>>>({})
// The latest save per feature; an older save must not clear a newer optimistic value.
const latestSave = new Map<PortalFeature, number>()
let saveCount = 0
let saveQueue: Promise<unknown> = Promise.resolve()
let installed = false

function client() {
  const { apiBaseUrl, authToken } = useAruna()
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

async function loadDefaults(epoch: number) {
  const { sessionEpoch } = useAruna()
  defaultsLoading.value = true
  try {
    const response = await getPortalFeatures(client())
    if (epoch === sessionEpoch.value) realmDefaults.value = response.features ?? {}
  } catch {
    // Older nodes have no realm defaults: every feature stays on.
  } finally {
    if (epoch === sessionEpoch.value) defaultsLoading.value = false
  }
}

function install() {
  if (installed) return
  installed = true
  effectScope(true).run(() => {
    const { sessionEpoch, userInfo } = useAruna()
    watch(
      [sessionEpoch, () => userInfo.value?.user.user_id],
      ([epoch, userId]) => {
        realmDefaults.value = {}
        pending.value = {}
        latestSave.clear()
        if (userId) void loadDefaults(epoch)
      },
      { immediate: true },
    )
  })
}

export function usePortalFeatures() {
  install()
  const { userInfo, isRealmAdmin, sessionEpoch, updateUserProfile } = useAruna()

  function attributes(): Record<string, string> {
    const stored = userInfo.value?.user.attributes ?? {}
    const overlay = Object.entries(pending.value).map(([key, value]) => [
      featureAttribute(key as PortalFeature),
      value === null || value === undefined ? '' : value ? 'on' : 'off',
    ])
    return { ...stored, ...Object.fromEntries(overlay) }
  }

  function shown(key: PortalFeature): boolean {
    return featureShown(key, {
      attributes: attributes(),
      isRealmAdmin: isRealmAdmin.value,
      defaults: realmDefaults.value,
    })
  }

  function choice(key: PortalFeature): boolean | null {
    return ownChoice(key, attributes())
  }

  /** Stores the user's choice; null removes it so the realm default applies. */
  async function setChoice(key: PortalFeature, value: boolean | null): Promise<void> {
    const attribute = featureAttribute(key)
    const save = ++saveCount
    const epoch = sessionEpoch.value
    latestSave.set(key, save)
    pending.value = { ...pending.value, [key]: value }
    // Saves run one after another so the node stores them in the order they were made.
    const run = saveQueue.then(() => {
      // A save queued in a session that has since ended must not reach the new one.
      if (epoch !== sessionEpoch.value) return
      return updateUserProfile(
        value === null
          ? { remove_attributes: [attribute] }
          : { set_attributes: { [attribute]: value ? 'on' : 'off' } },
      )
    })
    saveQueue = run.catch(() => undefined)
    try {
      await run
    } catch (err) {
      reportGlobalError(errorMessage(err))
    } finally {
      if (epoch === sessionEpoch.value && latestSave.get(key) === save) {
        latestSave.delete(key)
        const next = { ...pending.value }
        delete next[key]
        pending.value = next
      }
    }
  }

  async function saveDefaults(features: Record<string, boolean>): Promise<void> {
    const epoch = sessionEpoch.value
    const stored = await setPortalFeatures(features, client())
    if (epoch === sessionEpoch.value) realmDefaults.value = stored.features ?? {}
  }

  return { realmDefaults, defaultsLoading, shown, choice, setChoice, saveDefaults }
}
