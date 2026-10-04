import { expect, test, type Page } from '@playwright/test'

import { canonicalClaim, recordObservation, runId } from './observations.js'

/**
 * A verdict's WORDS and its STATE are one claim.
 *
 * A `toContainText` on its own is not enough, and the reason is specific: this
 * page paints a verdict's colour, its glyph and its border from `data-tone`. A
 * mutation that flipped the sentence while leaving `data-tone="pass"` in place
 * would be recorded as killed while the marker went on claiming success in every
 * way a reader can SEE. `expectVerdict` asserts both in a single call and REFUSES
 * a claim carrying only one of them, so the weak shape cannot be written by
 * accident.
 *
 * Each call that passes then RECORDS itself — the test that ran it, the marker it
 * asserted, the claim it asserted — into the run-scoped sink in
 * `e2e/observations.ts`. See that file for why a source-text scan would not do.
 *
 * Recording happens AFTER the assertions, never before: "observed" means the claim
 * executed and held, not that a call was reached.
 */
export interface VerdictClaim {
  /** `data-tone` on the marker: what a reader sees as colour and glyph. */
  tone: 'pass' | 'trap' | 'alarm' | 'retired' | 'open'
  /** Exact text of a descendant (`.verdict-headline` by default). */
  text?: string
  /** Substrings the marker's text must contain. */
  contains?: string | readonly string[]
  /** Substrings the marker's text must NOT contain. */
  absent?: string | readonly string[]
  /** Any other data attribute on the marker, e.g. `{ 'data-owner': 'mal' }`. */
  attrs?: Readonly<Record<string, string>>
  /** Assert text against this descendant instead of `.verdict-headline`. */
  label?: string
}

const list = (value: string | readonly string[] | undefined): readonly string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : value

export async function expectVerdict(
  page: Page,
  id: string,
  ...claims: readonly VerdictClaim[]
): Promise<void> {
  const marker = page.locator(`[data-verdict="${id}"]`)
  await expect(marker, `the page must render exactly one [data-verdict="${id}"]`).toHaveCount(1)
  expect(claims.length, `expectVerdict('${id}') was called with no claim`).toBeGreaterThan(0)

  for (const claim of claims) {
    const saysSomething = claim.text !== undefined || claim.contains !== undefined
    expect(
      saysSomething,
      `expectVerdict('${id}') needs the rendered words as well as the tone; a tone-only ` +
        'assertion cannot fail a mutation that rewrites the sentence',
    ).toBe(true)

    await expect(marker).toHaveAttribute('data-tone', claim.tone)
    const text = marker.locator(claim.label ?? '.verdict-headline')
    if (claim.text !== undefined) await expect(text).toHaveText(claim.text)
    for (const fragment of list(claim.contains)) await expect(marker).toContainText(fragment)
    for (const fragment of list(claim.absent)) await expect(marker).not.toContainText(fragment)
    for (const [name, value] of Object.entries(claim.attrs ?? {})) {
      await expect(marker).toHaveAttribute(name, value)
    }

    recordObservation({
      run: runId(),
      test: test.info().title,
      id,
      claim: canonicalClaim({ ...claim }),
    })
  }
}
