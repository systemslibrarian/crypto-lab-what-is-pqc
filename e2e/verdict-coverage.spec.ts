import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { boot } from './gate'

/**
 * Three questions this suite answers, none of which the claims suite can.
 *
 * 1. DOES EVERY MARKER THE PAGE RENDERS HAVE A RECORDED MUTATION? A verdict with
 *    no mutation behind it is a conclusion nobody has ever watched fail. The drive
 *    below visits every state this lab can reach and collects the markers that
 *    actually render, so a sixth verdict added next year fails this until it is
 *    recorded in `e2e/verdict-mutations.json`.
 *
 * 2. DOES ANYTHING RENDER AN OUTCOME OUTSIDE A MARKER? `.verdict` is the only
 *    class that paints a conclusion, and every one of them must carry
 *    `data-verdict`. A hand-written verdict block would be invisible to question 1
 *    and to the mutation runner alike.
 *
 * 3. DOES EVERY RECORDED MUTATION NAME A MARKER THE PAGE ACTUALLY RENDERS? The
 *    reverse of question 1, and the one that catches a record left behind after the
 *    verdict it covered was removed — a ledger entry describing a page that no
 *    longer exists, which reads as coverage and is not.
 *
 * `e2e/global-teardown.ts` asks the fourth question — whether the assertion each
 * record NAMES actually executed — which can only be answered from what ran.
 */
interface Registry {
  mutations: Record<string, { kills: Record<string, { test: string; claim: unknown }> }>
}

const registry = JSON.parse(
  readFileSync(new URL('./verdict-mutations.json', import.meta.url), 'utf8'),
) as Registry

const recordedMarkers = new Set(
  Object.values(registry.mutations).flatMap((entry) => Object.keys(entry.kills ?? {})),
)

/** Every marker id currently on the page. */
async function markersOn(page: Page): Promise<string[]> {
  return page.$$eval('[data-verdict]', (els) =>
    els.map((el) => el.getAttribute('data-verdict') ?? ''),
  )
}

/**
 * Drive every state this lab can reach, collecting markers at each.
 *
 * Deliberately the same route the accessibility gate takes, for the same reason:
 * a state nothing drives to is a state nothing measures. Where the two differ is
 * what they do on arrival — the gate scans, this counts.
 */
async function everyState(page: Page): Promise<Set<string>> {
  const seen = new Set<string>()
  const collect = async (): Promise<void> => {
    for (const id of await markersOn(page)) seen.add(id)
  }

  await collect() // arrival
  await page.locator('#classical-run').click()
  await collect()
  await page.locator('#pq-run').click()
  await collect()
  await page.locator('#break-run').click()
  await collect()
  await page.locator('#break-reset').click()
  await collect()
  await page.locator('#break-run').click()
  await page.locator('#pq-run').click() // retires panel 3
  await collect()
  await page.locator('#key-owner-impostor').check()
  await collect()
  await page.locator('#key-owner-rae').check()
  await collect()
  return seen
}

test.describe('verdict coverage', () => {
  test('every verdict marker the page renders has a recorded mutation', async ({ page }) => {
    await boot(page)
    const rendered = await everyState(page)
    expect(rendered.size, 'the drive must reach at least the five markers boot() asserts').toBe(5)
    const unrecorded = [...rendered].filter((id) => !recordedMarkers.has(id)).sort()
    expect(
      unrecorded,
      'these verdict markers render with no mutation proving their assertion bites — ' +
        'record one in e2e/verdict-mutations.json',
    ).toEqual([])
  })

  test('nothing renders a conclusion outside a marker', async ({ page }) => {
    await boot(page)
    const unmarked = await page.$$eval('.verdict', (els) =>
      els.filter((el) => !el.hasAttribute('data-verdict')).map((el) => el.outerHTML.slice(0, 120)),
    )
    expect(unmarked, 'every .verdict must carry data-verdict').toEqual([])
    // And every marker must be a verdict, rather than the attribute being sprinkled
    // on something that does not paint a conclusion.
    const notVerdicts = await page.$$eval('[data-verdict]', (els) =>
      els.filter((el) => !el.classList.contains('verdict')).map((el) => el.outerHTML.slice(0, 120)),
    )
    expect(notVerdicts, 'every data-verdict must be a .verdict').toEqual([])
  })

  test('every recorded mutation names a marker the page actually renders', async ({ page }) => {
    await boot(page)
    const rendered = await everyState(page)
    const stale = [...recordedMarkers].filter((id) => !rendered.has(id)).sort()
    expect(
      stale,
      'these mutations record a kill against a marker no state of this page renders — the ' +
        'record describes a page that no longer exists',
    ).toEqual([])
  })
})
