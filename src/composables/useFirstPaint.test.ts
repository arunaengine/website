import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useFirstPaint } from './useFirstPaint'

describe('useFirstPaint', () => {
  it('waits for every request, then stays painted through a refresh', async () => {
    const summary = ref(false)
    const crate = ref(false)
    const painted = useFirstPaint(() => summary.value && crate.value)

    expect(painted.value).toBe(false)
    summary.value = true
    await nextTick()
    expect(painted.value).toBe(false)

    crate.value = true
    await nextTick()
    expect(painted.value).toBe(true)

    // A background refresh flips the flag again; the page must not blank.
    crate.value = false
    await nextTick()
    expect(painted.value).toBe(true)
  })

  it('starts over when the key changes', async () => {
    const loaded = ref(true)
    const id = ref('a')
    const painted = useFirstPaint(() => loaded.value, () => id.value)
    expect(painted.value).toBe(true)

    loaded.value = false
    id.value = 'b'
    await nextTick()
    expect(painted.value).toBe(false)

    loaded.value = true
    await nextTick()
    expect(painted.value).toBe(true)
  })
})
