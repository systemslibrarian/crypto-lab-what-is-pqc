import { expect, test } from '@playwright/test'

import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  PHONE,
  reportCollected,
  watchPageErrors,
  WIDE,
} from './gate'

/**
 * WCAG 2.1 A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state with both
 * exchanges already run; the shared skip link focused; panel 1 and panel 2
 * re-run; panel 3 untouched, broken, put back, broken again and then retired by a
 * fresh run of panel 2; panel 4 on the honest key, on the impostor fixture, and
 * with the impostor radio focused inside that alarm-toned region; a primary button
 * and a shared top bar control hovered; a button and an outbound link focused.
 * Fourteen states, each scanned by nine oracles, at three widths.
 *
 * THREE WIDTHS, AND THE THIRD IS THE ONE THAT MATTERS. 1280 is desktop. 390 is a
 * current phone, which is where most readers of a beginner on-ramp will actually
 * arrive. 320 is the width WCAG 1.4.10 names — 320 CSS pixels, equivalent to
 * 1280px at 400% zoom — and it is the only one of the three that exercises this
 * lab's `auto-fit` grids at their minimum, where an unbreakable monospace run
 * pushes the document sideways.
 *
 * See `gate.ts` for why nothing is injected into the page (the old fleet gate's
 * `addStyleTag` motion kill bypassed the stylesheet's own reduced-motion block,
 * so the rendering reduced-motion readers get was never the one scanned), why the
 * lab's defaults are asserted rather than assumed, and why `violations` is not the
 * whole oracle.
 */
for (const [name, viewport] of [
  ['1280px desktop', WIDE],
  ['390px phone', PHONE],
  ['320px, the WCAG 1.4.10 floor', NARROW],
] as const) {
  test(`no WCAG A/AA violations at ${name}`, async ({ page }) => {
    const errors = watchPageErrors(page)
    await page.setViewportSize(viewport)
    await boot(page)
    await driveAllStates(page, `${viewport.width}px`)
    expect(errors, errors.join('\n')).toEqual([])
    expectBaselineNotStale()
    reportCollected()
  })
}
