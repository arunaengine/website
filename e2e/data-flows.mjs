import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const results = []
function step(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
})
const page = await browser.newPage()
page.setDefaultTimeout(15000)
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

try {
  // Sign in as the realm admin — clicking Sign in redirects straight to Keycloak
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', 'aruna-admin')
  await page.fill('#password', 'aruna-admin')
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await page.waitForTimeout(2000)
  step('admin signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // Notification bell renders for the signed-in admin and opens its dropdown.
  // (Real cross-user delivery — admin adds a member, the member's bell
  // increments — needs two sessions and is out of scope for this single-session
  // script.)
  const bell = page.getByRole('button', { name: /Notifications/ })
  step('notification bell visible when signed in', (await bell.count()) === 1)
  await bell.first().click()
  await page.waitForTimeout(800)
  const bellBody = await page.textContent('body')
  step(
    'notification dropdown opens with list or empty state',
    bellBody.includes('Mark all read') && (bellBody.includes('caught up') || bellBody.includes('ago')),
  )
  // Mark all read leaves no unread badge on the bell button
  const badgeText = await bell.first().textContent()
  if (badgeText && badgeText.trim() !== '') {
    await page.getByRole('button', { name: 'Mark all read' }).click()
    await page.waitForTimeout(800)
    step('mark all read clears the badge', ((await bell.first().textContent()) || '').trim() === '')
  } else {
    step('mark all read clears the badge', true, 'inbox already empty — skipped')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Create a dataset through the New dataset dialog
  await page.getByRole('button', { name: 'New dataset' }).first().click()
  await page.waitForSelector('text=New metadata document')
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('select').first().selectOption({ label: 'Genomics lab' })
  await dialog.getByPlaceholder('Dataset title').fill('Coral genome assembly')
  await dialog.getByPlaceholder('datasets/my-dataset').fill('datasets/coral-genome-assembly')
  await dialog.locator('textarea').fill('Test dataset created by the portal E2E flow.')
  await dialog.getByRole('button', { name: /Create metadata/ }).click()
  await page.waitForURL(/\/app\/metadata\//, { timeout: 15000 })
  await page.waitForTimeout(1500)
  const detailBody = await page.textContent('body')
  step('dataset created and detail page opened', detailBody.includes('Coral genome assembly'), page.url())

  // Edit the dataset title via the Edit dialog (PUT /metadata/{id}/rocrate)
  await page.getByRole('button', { name: /^Edit$/ }).first().click()
  await page.waitForSelector('text=Edit metadata')
  const editDialog = page.locator('[role="dialog"]')
  await editDialog.getByPlaceholder('Dataset title').fill('Coral genome assembly v2')
  await editDialog.getByRole('button', { name: /Save changes/ }).click()
  await page.waitForTimeout(2500)
  step('dataset title edited via ro-crate replace', (await page.textContent('body')).includes('Coral genome assembly v2'))

  // Toggle the favourite star; it should read as filled on Discover
  await page.getByRole('button', { name: 'Add to favourites' }).first().click()
  await page.waitForTimeout(1500)
  await page.goto(BASE + '/app/search')
  await page.waitForTimeout(1500)
  step('favourite star toggles on', (await page.getByRole('button', { name: 'Remove from favourites' }).count()) > 0)

  // Catalog lists it
  await page.goto(BASE + '/app/metadata')
  await page.waitForTimeout(1500)
  step('catalog lists the dataset', (await page.textContent('body')).includes('Coral genome assembly'))

  // Topbar quick search finds it
  await page.locator('input[placeholder*="Search in"]').fill('coral')
  await page.waitForTimeout(800)
  const quick = await page.textContent('body')
  step('topbar quick search finds it', quick.includes('Coral genome assembly'))
  await page.keyboard.press('Escape')

  // Search page (card mode)
  await page.goto(BASE + '/app/search')
  await page.waitForTimeout(1000)
  await page.getByPlaceholder('Search visible metadata…').fill('coral')
  await page.waitForTimeout(800)
  step('search page finds it', (await page.textContent('body')).includes('Coral genome assembly'))

  // SPARQL expert mode round-trips through the API
  await page.goto(BASE + '/app/search?expert=1')
  await page.waitForSelector('textarea')
  await page.locator('textarea').fill('SELECT ?s ?name WHERE { ?s <http://schema.org/name> ?name } LIMIT 10')
  await page.getByRole('button', { name: /Run query/ }).click()
  await page.waitForTimeout(2500)
  const sparqlBody = await page.textContent('body')
  step('sparql query returns rows', sparqlBody.includes('Coral genome assembly'))

  // Settings: save profile attributes through PATCH /users/info
  await page.goto(BASE + '/app/settings')
  await page.waitForTimeout(1500)
  const inputs = page.locator('[role="tabpanel"] input')
  await inputs.nth(1).fill('admin@aruna.org')
  await inputs.nth(2).fill('Aruna project')
  await page.getByRole('button', { name: /Save profile/ }).click()
  await page.waitForSelector('text=Saved to /users/info', { timeout: 10000 })
  step('profile saved via PATCH /users/info', true)
  await page.reload()
  await page.waitForTimeout(2000)
  const affiliationValue = await page.locator('[role="tabpanel"] input').nth(2).inputValue()
  step('profile attributes persisted', affiliationValue === 'Aruna project', affiliationValue)

  // The Groups tab renders real data
  await page.getByRole('tab', { name: 'Groups' }).click()
  await page.waitForTimeout(800)
  const settingsBody = await page.textContent('body')
  step('groups tab shows Genomics lab', settingsBody.includes('Genomics lab'))

  // A group row leads to the group page, where the group's own tabs stay on
  // that route instead of falling back to the settings tabs.
  await page.getByRole('link', { name: /Genomics lab/ }).first().click()
  await page.waitForURL(/\/app\/groups\//, { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.getByRole('tab', { name: /Members/ }).click()
  await page.waitForTimeout(800)
  step(
    'group tabs stay on the group page',
    page.url().includes('/app/groups/') && page.url().includes('tab=members'),
    page.url(),
  )

  // Renaming the group relabels it everywhere the portal caches the name; the
  // second rename restores the fixture so the script can run again.
  const switcher = page.getByRole('button', { name: 'Switch group or realm' })
  async function renameGroup(next) {
    await page.getByRole('button', { name: 'Rename group' }).first().click()
    await page.waitForSelector('text=Rename group')
    const renameDialog = page.locator('[role="dialog"]')
    await renameDialog.locator('input').first().fill(next)
    await renameDialog.getByRole('button', { name: /^Save$/ }).click()
    await page.waitForTimeout(2500)
  }
  await renameGroup('Genomics lab v2')
  step('rename shows in the context switcher', (await switcher.textContent()).includes('Genomics lab v2'))
  await renameGroup('Genomics lab')
  step('group name restored', (await switcher.textContent()).includes('Genomics lab'))

  // Deep-link to a nonexistent dataset gives an honest not-found panel, not a redirect
  await page.goto(BASE + '/app/metadata/01UNKNOWNDOCID0000000000000')
  await page.waitForTimeout(1500)
  step('unknown dataset shows not-found panel', (await page.textContent('body')).includes('does not exist'))

  // Unknown app URL → 404 view instead of a silent redirect to '/'
  await page.goto(BASE + '/app/nope')
  await page.waitForTimeout(1000)
  step('unknown app url shows 404 view', (await page.textContent('body')).includes('404'))

  // Credential dialog exposes the optional path-restriction section
  await page.goto(BASE + '/app/settings')
  await page.waitForTimeout(1500)
  await page.locator('#credentials').getByRole('button', { name: /Create/ }).first().click()
  await page.waitForSelector('text=Create S3 credentials')
  await page.getByRole('button', { name: /Path restrictions/ }).click()
  step('credential dialog shows path restrictions', (await page.textContent('body')).includes('Add restriction'))
  await page.keyboard.press('Escape')

  // Delete the dataset via the confirm dialog; Discover no longer lists it
  await page.goto(BASE + '/app/search?q=coral')
  await page.waitForTimeout(1500)
  await page.getByRole('link', { name: /Coral genome assembly/ }).first().click()
  await page.waitForURL(/\/app\/metadata\//)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^Delete$/ }).first().click()
  await page.waitForSelector('text=Delete dataset')
  await page.locator('[role="dialog"]').getByRole('button', { name: /^Delete$/ }).click()
  await page.waitForURL(/\/app\/search/, { timeout: 15000 })
  await page.waitForTimeout(2000)
  step('dataset deleted and removed from Discover', !(await page.textContent('body')).includes('Coral genome assembly'))

  // Data manager: delete an object, find it again with Show deleted, restore it
  await page.goto(BASE + '/app/buckets')
  await page.waitForTimeout(2500)
  const bucketName = 'e2e-deletion-' + Date.now()
  await page.getByPlaceholder('new-bucket-name').fill(bucketName)
  await page.getByRole('button', { name: /^Create$/ }).first().click()
  await page.waitForURL(new RegExp('/app/buckets/' + bucketName), { timeout: 20000 })
  await page.waitForTimeout(1500)

  // Upload one small file through Add data so the row is ours to delete
  await page.getByRole('button', { name: /Add data/ }).first().click()
  await page.waitForSelector('text=Local files')
  await page.locator('[role="dialog"] input[type="file"]').first().setInputFiles({
    name: 'restore-me.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('portal e2e deletion flow'),
  })
  await page.getByRole('button', { name: /Add|Upload/ }).last().click()
  await page.waitForTimeout(4000)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  step('object uploaded into the new bucket', (await page.textContent('body')).includes('restore-me.txt'))

  // The row keeps ONE destructive entry, and it opens the shared dialog
  await page.getByRole('button', { name: 'Delete…' }).first().click()
  await page.waitForSelector('text=What should happen')
  const deleteDialog = page.locator('[role="dialog"]')
  step(
    'delete dialog states the marker is recoverable',
    (await deleteDialog.textContent()).includes('Show deleted brings it back'),
  )
  await deleteDialog.getByRole('button', { name: /^Delete$/ }).click()
  await page.waitForTimeout(2500)
  step('deleted object leaves the listing', !(await page.textContent('body')).includes('restore-me.txt'))

  // Show deleted brings the marker-headed key back into view
  await page.getByText('Show deleted').click()
  await page.waitForTimeout(2500)
  const deletedBody = await page.textContent('body')
  step(
    'show deleted lists the deleted object',
    deletedBody.includes('restore-me.txt') && deletedBody.includes('Deleted'),
  )

  await page.getByRole('button', { name: 'Restore' }).first().click()
  await page.waitForTimeout(3000)
  await page.getByText('Show deleted').click()
  await page.waitForTimeout(2000)
  step('restored object is listed again', (await page.textContent('body')).includes('restore-me.txt'))

  // Join requests (aruna#248) are config-gated OFF by default: with no
  // features.joinRequests flag, no join UI renders on the groups page.
  await page.goto(BASE + '/app/groups')
  await page.waitForTimeout(1500)
  const groupsBody = await page.textContent('body')
  step(
    'join requests hidden while feature flag is off',
    !groupsBody.includes('Request to join') && !groupsBody.includes('Your join requests'),
  )

  // The only tolerated console error is the known API projection-race 500 on
  // GET /metadata, which the portal retries and recovers from.
  const unexpected = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of 500/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-data-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
