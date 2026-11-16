import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Remove ELECTRON_RUN_AS_NODE if set (e.g. by IDE shell) so Electron launches as GUI app
  const { ELECTRON_RUN_AS_NODE, ...restEnv } = process.env
  void ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [join(__dirname, '..', '..', 'out', 'main', 'index.cjs')],
    env: {
      ...restEnv,
      NODE_ENV: 'test'
    }
  })

  // Capture console messages for debugging
  page = await app.firstWindow()
  page.on('console', msg => console.log(`[renderer console] ${msg.type()}: ${msg.text()}`))
  page.on('pageerror', err => console.log(`[renderer error] ${err.message}`))

  // Wait for the app to load
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

/** Helper: open command palette via synthetic keydown event */
async function openCommandPalette(): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
  })
}

/** Helper: close command palette by pressing Escape on its input */
async function closeCommandPalette(): Promise<void> {
  // Press Escape on the command palette input (if visible)
  const paletteInput = page.locator('input[placeholder*="Search units, template"]')
  if (await paletteInput.isVisible().catch(() => false)) {
    await paletteInput.press('Escape')
  }
  await page.waitForTimeout(200)
}

test.describe('PyiTOL Studio E2E Smoke Tests', () => {
  test('app launches and shows welcome page', async () => {
    await expect(page.locator('h1')).toContainText('PyiTOL Studio', { timeout: 10000 })
  })

  test('welcome page shows action cards', async () => {
    const cards = page.locator('button.card')
    await expect(cards).toHaveCount(3, { timeout: 5000 })
  })

  test('clicking "New Project" navigates to workbench', async () => {
    const newButton = page.locator('button.card').first()
    await newButton.click()
    await expect(page.locator('text=Annotation units')).toBeVisible({ timeout: 5000 })
  })

  test('open example project shows units and inspector', async () => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('menu-command', { detail: 'open-example' }))
    })
    await page.waitForTimeout(3000)
    const unitButtons = page.locator('button:has(span:has-text("rows"))')
    const count = await unitButtons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('selecting a unit shows preview text', async () => {
    const unitButton = page.locator('button:has(span:has-text("rows"))').first()
    await unitButton.click()
    await page.waitForTimeout(3000)
    const preview = page.locator('pre')
    await expect(preview).toBeVisible({ timeout: 10000 })
  })

  test('command palette opens with Cmd+K', async () => {
    await openCommandPalette()
    await expect(page.locator('input[placeholder*="Search units, template"]')).toBeVisible({
      timeout: 5000
    })
    await closeCommandPalette()
  })

  test('command palette shows units and commands', async () => {
    await openCommandPalette()
    // Use exact text match to distinguish from 'Annotation units' in the navigator
    await expect(page.locator('div').filter({ hasText: /^Units$/ })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('div').filter({ hasText: /^Commands$/ })).toBeVisible({
      timeout: 5000
    })

    // Type a search query
    const input = page.locator('input[placeholder*="Search units, template"]')
    await input.fill('save')
    await page.waitForTimeout(500)

    await closeCommandPalette()
  })

  test('inspector shows parameter fields', async () => {
    // Self-contained setup: make sure a project with a selected unit is loaded
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('menu-command', { detail: 'open-example' }))
    })
    await page.waitForTimeout(3000)
    const unitButton = page.locator('button:has(span:has-text("rows"))').first()
    await unitButton.click()
    await page.waitForTimeout(2000)
    // If the IDL fetch failed (e.g. sidecar still warming up), retry once —
    // the inspector shows an error + Retry instead of hanging on "Loading".
    const idlError = page.locator('text=/failed to load the form definition/i')
    if (await idlError.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
    }
    // Inspector should show parameter validation status (either outcome is fine)
    await expect(page.locator('text=/parameters valid|need fixing/i').first()).toBeVisible({
      timeout: 10000
    })
  })

  test('data table shows rows with status column', async () => {
    // Self-contained setup: ensure the workbench with the example project is open
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('menu-command', { detail: 'open-example' }))
    })
    await page.waitForTimeout(3000)
    // The table should have a status column header
    await expect(page.locator('th:has-text("Status")')).toBeVisible({ timeout: 5000 })
  })

  test('toolbar buttons are present', async () => {
    // Self-contained setup: ensure the workbench is open (toolbar is not on the welcome page)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('menu-command', { detail: 'open-example' }))
    })
    await page.waitForTimeout(3000)
    // Check for toolbar buttons by their text labels
    await expect(page.getByRole('button', { name: 'Template Wizard' })).toBeVisible({
      timeout: 5000
    })
    await expect(page.getByRole('button', { name: 'Generate Preview' })).toBeVisible({
      timeout: 5000
    })
    await expect(page.getByRole('button', { name: /Upload/ })).toBeVisible({ timeout: 5000 })
  })

  test('engine accepts legacy uppercase template type names', async () => {
    // Regression: legacy .pyitolproj files store UPPERCASE type names; the sidecar
    // must normalize them instead of failing with "Unknown template type".
    const result = await page.evaluate(async () => {
      return await window.pyitol.sidecar.call('build_form_idl', {
        type: 'DATASET_COLORSTRIP',
        locale: 'en'
      })
    })
    expect((result as { type_name: string }).type_name).toBe('dataset_colorstrip')
  })

  test('engine banner clears and sidecar responds end-to-end', async () => {
    // Renderer → main → sidecar handshake must succeed; the retry loop keeps
    // the "connecting / not connected" banners only until it does.
    const engineVersion = await page.evaluate(async () => {
      const r = await window.pyitol.sidecar.call('handshake', {
        client: 'e2e',
        version: '0.3.0'
      })
      return (r as { engine_version: string }).engine_version
    })
    expect(String(engineVersion)).toBeTruthy()

    // Neither the connecting nor the disconnected banner may remain stuck.
    await expect(page.locator('text=Python engine connecting')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('text=Python engine not connected')).toHaveCount(0)
  })
})
