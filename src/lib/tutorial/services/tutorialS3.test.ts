import { describe, expect, it } from 'vitest'
import { UPLOAD_VERSION } from '../fixtures/data'
import { tutorialS3 } from './tutorialS3'

describe('tutorial storage', () => {
  it('answers an upload with a stable version, so a run can pin its script', async () => {
    const s3 = tutorialS3('user-id')
    const first = await s3.putTextObject('tutorial-results', 'scripts/run.py', 'print(1)', 'text/x-python')
    const again = await s3.putTextObject('tutorial-results', 'scripts/run.py', 'print(2)', 'text/x-python')

    expect(first.versionId).toBe(UPLOAD_VERSION)
    expect(again.versionId).toBe(first.versionId)
  })
})
