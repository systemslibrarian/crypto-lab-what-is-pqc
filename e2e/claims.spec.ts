import { expect, test, type Page } from '@playwright/test'

import { expectVerdict } from './expect-verdict'
import { boot } from './gate'
import { recordClaimsProjectRan } from './observations'

/**
 * The claims suite — what this lab's page SAYS and CONCLUDES, as opposed to what
 * it is shaped like (§4.1b, §4.1d of the master template).
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING: compare two values the page itself
 * printed, rather than asserting against a hardcoded string. A test that
 * re-derives the same expression the source uses will happily agree with a bug —
 * that has happened in this fleet, where a fix was "verified" by a test that
 * recomputed the identical faulty branch condition.
 *
 * AND INTERNAL CONSISTENCY IS NOT ENOUGH, because a page can be consistently
 * wrong. So the mix here is deliberate:
 *
 *   cross-checks            two surfaces that must agree — a verdict against the
 *                           two secret prefixes printed above it; a byte count's
 *                           `data-wire-bytes` against the words beside it.
 *   independent re-derivation
 *                           the growth factor recomputed from the two totals on
 *                           screen, by division, rather than from the source's
 *                           own expression.
 *   parts-sum-to-whole      the four wire rows add up to the two totals.
 *
 * WHY THESE ARE NOT IN gate.ts. A one-word copy edit must not fail a step called
 * "Accessibility gate". crypto-lab-mceliece-gate lost three days of corrected
 * security claims to exactly that on 2026-09-26, and the one red thing in sight
 * named the wrong subject. Here a failure says "claims", which is what changed.
 *
 * EVERY VERDICT ASSERTION GOES THROUGH `expectVerdict`, which asserts the words
 * and the rendered tone as ONE claim and records that it executed. `e2e/verdict-
 * mutations.json` names the test and the claim that kills each mutation, and
 * `global-teardown.ts` fails the run if a recorded kill never actually ran.
 */

/**
 * Stamp the observation sink so `globalTeardown` knows this project ran.
 *
 * Without it the teardown cannot tell "the claims project asserted nothing" from
 * "the claims project was not selected", and would fail `npm run test:a11y` for a
 * rule that run was never asked. `beforeAll` fires once per worker, which is more
 * stamps than strictly needed and exactly the right number for the question being
 * asked: did this project start at all?
 */
test.beforeAll(() => {
  recordClaimsProjectRan()
})

/**
 * Every word on the page, disclosures included.
 *
 * `innerText` reports what is RENDERED, and a closed `<details>` renders only its
 * summary — so a copy rule checked against the arrival text would silently stop
 * covering everything a reader can open. The brief's two hard rules are rules about
 * the whole page, so the whole page has to be read: open every disclosure, then ask.
 */
async function fullText(page: Page): Promise<string> {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('#app details')) (d as HTMLDetailsElement).open = true
  })
  return page.locator('#app').innerText()
}

/** "2,272 bytes" -> 2272. Reads what a reader reads, not an attribute. */
function bytesFromText(text: string): number {
  const match = /([\d,]+)\s*bytes/.exec(text)
  if (!match) throw new Error(`no byte count in: ${JSON.stringify(text)}`)
  return Number(match[1].replace(/,/g, ''))
}

/** The 16-hex-character prefixes a verdict quotes, in order. */
function prefixesIn(text: string): string[] {
  return [...text.matchAll(/\b([0-9a-f]{16})\b/g)].map((m) => m[1])
}

async function secretsOf(page: Page, panel: string): Promise<[string, string]> {
  const rae = ((await page.locator(`${panel} [data-secret="rae"]`).textContent()) ?? '').trim()
  const dev = ((await page.locator(`${panel} [data-secret="dev"]`).textContent()) ?? '').trim()
  return [rae.replace(/…$/, ''), dev.replace(/…$/, '')]
}

test.describe('the two exchanges', () => {
  test('panel 1 concludes what the two secrets it printed actually show', async ({ page }) => {
    await boot(page)
    const [rae, dev] = await secretsOf(page, '#panel-classical')
    // The cross-check: the verdict and the two values above it are two surfaces
    // that must agree. Nothing here recomputes X25519 — that is the unit suite's
    // job — so a page that agreed with itself while reporting a different
    // exchange's values could not pass this.
    expect(rae, 'panel 1 printed two secrets, and they must be the same bytes').toBe(dev)
    await expectVerdict(page, 'classical-agreed', {
      tone: 'pass',
      text: 'Same secret on both sides',
      contains: [rae, dev, '32 bytes'],
      absent: 'stronger',
    })
  })

  test('panel 2 concludes what the two secrets it printed actually show', async ({ page }) => {
    await boot(page)
    const [rae, dev] = await secretsOf(page, '#panel-pq')
    expect(rae, 'panel 2 printed two secrets, and they must be the same bytes').toBe(dev)
    await expectVerdict(page, 'pq-agreed', {
      tone: 'pass',
      text: 'Same secret on both sides',
      contains: [rae, dev, '32 bytes'],
      absent: 'stronger',
    })
  })

  test('the two panels agree on the one thing that did not change', async ({ page }) => {
    await boot(page)
    // The lab's whole argument: same job, same secret size, different problem. If
    // the two panels ever printed different secret sizes, "bigger, not stronger"
    // would be describing something else.
    const classical = await page.locator('[data-verdict="classical-agreed"]').innerText()
    const pq = await page.locator('[data-verdict="pq-agreed"]').innerText()
    const sizeOf = (text: string): number => bytesFromText(text)
    expect(sizeOf(classical)).toBe(sizeOf(pq))
  })
})

test.describe('the size comparison', () => {
  test('the growth factor is the quotient of the two totals on screen', async ({ page }) => {
    await boot(page)
    const classicalTotal = bytesFromText(
      (await page.locator('[data-total="classical"]').textContent()) ?? '',
    )
    const pqTotal = bytesFromText((await page.locator('[data-total="pq"]').textContent()) ?? '')

    // INDEPENDENT RE-DERIVATION: division, done here, over the two numbers a
    // reader can see — not the source's expression re-typed. The lab chose size as
    // its comparison precisely because a reader can check it this way, so the test
    // checks it the same way the reader would.
    const expected = Math.round((pqTotal / classicalTotal) * 10) / 10
    expect(expected, 'the published ML-KEM-768 and X25519 sizes give 2272/64').toBe(35.5)

    await expectVerdict(page, 'size-change', {
      tone: 'pass',
      contains: [
        `The key-agreement messages are ${expected} times bigger`,
        `${pqTotal.toLocaleString('en-US')}`,
      ],
      // The headline must stay scoped. "35.5 times bigger" is true of these two
      // exchanges and of nothing else, so the verdict may not reach for a whole
      // connection or for speed — and it may not end on "nothing else changed",
      // which the very next panel contradicts.
      absent: ['stronger', 'slower', 'handshake', 'Nothing else'],
    })
  })

  test('the two bars are drawn to the scale of the numbers beside them', async ({ page }) => {
    await boot(page)
    // THE GRAPHIC IS CROSS-CHECKED AGAINST THE ARITHMETIC. A bar chart is a second
    // way to state a ratio, which makes it a second way to get the ratio wrong —
    // and a reader who trusts the picture has no way to tell. So the rendered
    // widths are read back and compared with the measured byte counts.
    const bars = await page.$$eval('.size-bar-fill', (els) =>
      els.map((el) => ({
        key: el.getAttribute('data-bar'),
        bytes: Number(el.getAttribute('data-bar-bytes')),
        width: el.getBoundingClientRect().width,
        trackWidth: (el.parentElement as HTMLElement).getBoundingClientRect().width,
      })),
    )
    expect(bars).toHaveLength(2)
    const widest = Math.max(...bars.map((b) => b.bytes))
    for (const bar of bars) {
      const painted = bar.width / bar.trackWidth
      const expected = bar.bytes / widest
      // Sub-pixel rounding and the track's 1px border, nothing more.
      expect(Math.abs(painted - expected), `${bar.key} bar is not to scale`).toBeLessThan(0.02)
    }

    // The bars, the byte counts and the verdict are three statements of one ratio,
    // so they are asserted together. A picture that disagrees with the sentence
    // beside it is the failure this test exists for, and the reader looking at the
    // picture is the one who cannot tell.
    const ratio = Math.round((widest / Math.min(...bars.map((b) => b.bytes))) * 10) / 10
    await expectVerdict(page, 'size-change', {
      tone: 'pass',
      contains: `The key-agreement messages are ${ratio} times bigger`,
    })
  })

  test('the agreed secret is kept out of the transmitted-bytes comparison', async ({ page }) => {
    await boot(page)
    // It never crossed the wire, so counting it as traffic would be wrong. The
    // rows and the bars must both exclude it, and it must still be ON the page —
    // "the thing that did not change" is half the lesson.
    const rowKeys = await page.$$eval('.size-row [data-size]', (els) =>
      els.map((el) => el.getAttribute('data-size')),
    )
    expect(rowKeys.sort()).toEqual(['classical-Dev', 'classical-Rae', 'pq-Dev', 'pq-Rae'])
    await expect(page.locator('.size-local [data-size="agreed-secret"]')).toHaveText('32 bytes')
    const barBytes = await page.$$eval('.size-bar-fill', (els) =>
      els.map((el) => Number(el.getAttribute('data-bar-bytes'))),
    )
    expect(barBytes).not.toContain(32)
  })

  test('the four wire rows sum to the two totals beside them', async ({ page }) => {
    await boot(page)
    // PARTS-SUM-TO-WHOLE. The rows and the totals are computed from the same byte
    // arrays but printed by different code paths, so a row that silently stopped
    // being included in its own total shows up here and nowhere else.
    const sumOf = async (keys: readonly string[]): Promise<number> => {
      let total = 0
      for (const key of keys) {
        total += bytesFromText((await page.locator(`[data-size="${key}"]`).textContent()) ?? '')
      }
      return total
    }
    expect(await sumOf(['classical-Rae', 'classical-Dev'])).toBe(
      bytesFromText((await page.locator('[data-total="classical"]').textContent()) ?? ''),
    )
    expect(await sumOf(['pq-Rae', 'pq-Dev'])).toBe(
      bytesFromText((await page.locator('[data-total="pq"]').textContent()) ?? ''),
    )
  })

  test('every byte count in words matches the machine value beside it', async ({ page }) => {
    await boot(page)
    // CROSS-CHECK across every wire item in both panels: `data-wire-bytes` is what
    // a test or a script reads, and the sentence is what a reader reads. A
    // formatter that dropped a digit would separate the two.
    const items = await page.locator('.wire-item-bytes').all()
    expect(items.length).toBe(4)
    for (const item of items) {
      const attr = await item.getAttribute('data-wire-bytes')
      expect(bytesFromText((await item.textContent()) ?? '')).toBe(Number(attr))
    }
  })
})

test.describe('breaking one byte', () => {
  test('the untouched state says nothing has changed and the secrets match', async ({ page }) => {
    await boot(page)
    await expectVerdict(page, 'byte-flip', {
      tone: 'pass',
      text: 'Nothing has been changed yet',
      contains: ['1,088 bytes', 'untouched'],
    })
    // The two facts are reported separately, because they are separate facts.
    await expect(page.locator('[data-fact="match"]')).toHaveText('Yes — all 32 bytes.')
    await expect(page.locator('[data-fact="error"]')).toHaveText('Nothing has been opened yet.')
  })

  test('changing one byte leaves two different secrets and no reported failure', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('#break-toggle').click()

    // Read the two secrets the page PRINTS side by side and compare them HERE. The
    // page's own `secretsMatch` is not consulted: this is the one claim the lab
    // exists to make, so the test re-derives the difference from what is shown.
    const rae = prefixesIn(await page.locator('[data-held="rae"]').innerText())
    const dev = prefixesIn(await page.locator('[data-held="dev"]').innerText())
    expect(rae.length, "Rae's secret must be printed").toBe(1)
    expect(dev.length, "Dev's secret must be printed").toBe(1)
    expect(rae[0], 'the two secrets must differ after one byte changed').not.toBe(dev[0])

    // And the two facts stay apart: they differ, AND nothing was raised. A page
    // that collapsed these into one line is how a reader concludes that ML-KEM
    // detected the tampering.
    await expect(page.locator('[data-fact="match"]')).toHaveText('No — they differ.')
    await expect(page.locator('[data-fact="error"]')).toHaveText(
      'No. It returned a secret and said nothing.',
    )

    await expectVerdict(page, 'byte-flip', {
      tone: 'trap',
      text: 'Different secrets — and nothing reported a failure',
      contains: ['No error was raised and no exception was thrown', '32 bytes'],
    })
  })

  test('activating the control by keyboard leaves focus on it', async ({ page }) => {
    await boot(page)
    // WCAG 2.4.3. The button used to be destroyed and replaced on activation, which
    // dropped focus to <body> — measured on the shipped build, in both directions.
    // axe has no rule for it and the a11y gate could not see it, because the drive
    // clicked rather than typed. One stable toggle is the fix, and this is the test
    // that would have caught the defect.
    await page.locator('#break-toggle').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-verdict="byte-flip"]')).toHaveAttribute('data-tone', 'trap')
    await expect(page.locator('#break-toggle')).toBeFocused()
    await expect(page.locator('#break-toggle')).toHaveAttribute('data-mode', 'restore')

    await page.keyboard.press('Enter')
    await expect(page.locator('[data-verdict="byte-flip"]')).toHaveAttribute('data-tone', 'pass')
    await expect(page.locator('#break-toggle')).toBeFocused()
    await expect(page.locator('#break-toggle')).toHaveAttribute('data-mode', 'break')
  })

  test('the verdict live region is the same element across every state', async ({ page }) => {
    await boot(page)
    // `role="status"` names an element an assistive technology observes. Replacing
    // that element on every render — which this page used to do — leaves the
    // observer watching a node that is no longer in the document, and makes whether
    // anything is announced a property of timing rather than of the markup. Whether
    // a given screen reader announces these usefully is NOT established by this
    // test; that needs a screen reader. What this establishes is that the live
    // region survives, which is the precondition.
    const stable = await page.evaluate(async () => {
      const first = document.querySelector('[data-verdict="byte-flip"]')
      const toggle = document.getElementById('break-toggle') as HTMLButtonElement
      toggle.click()
      await new Promise((r) => requestAnimationFrame(r))
      const second = document.querySelector('[data-verdict="byte-flip"]')
      toggle.click()
      await new Promise((r) => requestAnimationFrame(r))
      const third = document.querySelector('[data-verdict="byte-flip"]')
      return first === second && second === third
    })
    expect(stable, 'the live region must not be replaced when the panel updates').toBe(true)
  })

  test('re-running panel 2 retires the broken result and says it was retired', async ({ page }) => {
    await boot(page)
    await page.locator('#break-toggle').click()
    await expect(page.locator('[data-verdict="byte-flip"]')).toHaveAttribute('data-tone', 'trap')

    await page.locator('#pq-run').click()
    // RETIREMENT (§4.1b): the stale conclusion is gone AND the page says it went,
    // in words aimed at the reader rather than at the panel numbering.
    await expectVerdict(page, 'byte-flip', {
      tone: 'retired',
      text: 'That result belongs to the previous exchange',
      contains: 'no longer exists',
      absent: 'Different secrets',
    })
  })

  test('re-running panel 1 does NOT retire a fresh broken result', async ({ page }) => {
    await boot(page)
    await page.locator('#break-toggle').click()
    const before = await page.locator('[data-verdict="byte-flip"]').getAttribute('data-run')

    // THE NO-OP GUARD (§4.1b). Panel 3 is about panel 2's sealed box. Panel 1 is a
    // different exchange, so running it must leave panel 3's conclusion standing —
    // retiring a fresh verdict for an unrelated action is the failure this guards.
    await page.locator('#classical-run').click()
    await expect(page.locator('[data-verdict="classical-agreed"]')).toHaveAttribute('data-run', '2')
    await expectVerdict(page, 'byte-flip', {
      tone: 'trap',
      text: 'Different secrets — and nothing reported a failure',
    })
    expect(await page.locator('[data-verdict="byte-flip"]').getAttribute('data-run')).toBe(before)
  })
})

test.describe('the negative claim — what ML-KEM does not buy (§4.1d)', () => {
  const NEGATIVE_CLAIM =
    'ML-KEM agreed on a secret and proved nothing about who is holding the other end of it.'

  test('the fixture is reachable, and in it every check the page makes reports success', async ({
    page,
  }) => {
    await boot(page)

    // 1. REACH THE FIXTURE, through the UI.
    await page.locator('#key-owner-impostor').check()
    await expect(page.locator('[data-verdict="key-owner"]')).toHaveAttribute('data-owner', 'mal')

    // 2. EVERYTHING IS GREEN — asserted against the RENDERED verdicts, not a flag
    //    this test sets. Four of the five markers report success outright, and the
    //    fifth reports success in its own headline before naming the limit. If any
    //    check actually failed here the fixture would be wrong: it would be
    //    demonstrating the mechanism breaking rather than its limit.
    for (const marker of ['classical-agreed', 'pq-agreed', 'size-change', 'byte-flip']) {
      await expect(page.locator(`[data-verdict="${marker}"]`)).toHaveAttribute('data-tone', 'pass')
    }
    await expectVerdict(page, 'key-owner', {
      tone: 'alarm',
      text: 'Same secret on both sides — and Rae is not one of them',
      contains: ['Every check on this page passed', '1,184 bytes', '1,088 bytes'],
    })

    // And the relationship is DRAWN, not only described: three participants, with
    // the one Dev named holding nothing.
    await expect(page.locator('#panel-owner .who-card')).toHaveCount(3)
    await expect(page.locator('#panel-owner [data-who="rae"]')).toHaveClass(/who-absent/)
    await expect(page.locator('#panel-owner [data-who="rae"]')).toContainText(
      'Holds no part of this secret',
    )
    // Dev and the actual owner hold the same bytes — read off the two cards.
    const dev = (await page.locator('#panel-owner [data-who="dev"] .who-held').innerText()).trim()
    const mal = (await page.locator('#panel-owner [data-who="mal"] .who-held').innerText()).trim()
    expect(dev).toBe(mal)
  })

  test('the limitation is on screen in that state, not in the README', async ({ page }) => {
    await boot(page)
    await page.locator('#key-owner-impostor').check()

    // 3. THE LIMITATION IS VISIBLE IN THAT STATE. Not behind a disclosure, not in
    //    the repository, and tied to this fixture rather than floating in the
    //    page's small print.
    const limitation = page.locator('[data-limitation="authentication"]')
    await expect(limitation).toBeVisible()
    await expect(limitation).toContainText(NEGATIVE_CLAIM)
    await expect(limitation).toContainText('an exchange is not an introduction')
    expect(
      await limitation.evaluate((el) => el.closest('details') !== null),
      'the negative claim must not be behind a disclosure',
    ).toBe(false)

    // And it is in the verdict itself, which is where a reader is already looking.
    await expectVerdict(page, 'key-owner', {
      tone: 'alarm',
      contains: NEGATIVE_CLAIM,
    })
  })

  test('with the honest key the same exchange reaches the person it names', async ({ page }) => {
    await boot(page)
    // The control state for the fixture. Without it "every check passed" in the
    // impostor state means nothing: it has to be the SAME exchange behaving the
    // same way, differing only in who owned the key.
    await expectVerdict(page, 'key-owner', {
      tone: 'pass',
      text: 'Same secret on both sides, and this time it really is Rae',
      attrs: { 'data-owner': 'rae' },
    })
  })

  test('re-selecting the owner already chosen does not re-run the exchange', async ({ page }) => {
    await boot(page)
    const serial = await page.locator('[data-verdict="key-owner"]').getAttribute('data-run')
    // A change event for the value already selected. A pointer cannot normally
    // produce one, but assistive technology and scripted selection can, and the
    // guard that ignores it is what stops a reader's verdict being thrown away and
    // replaced by a different exchange mid-read.
    await page.locator('#key-owner-rae').dispatchEvent('change')
    await expect(page.locator('[data-verdict="key-owner"]')).toHaveAttribute(
      'data-run',
      serial as string,
    )
  })
})

test.describe("the brief's hard rules, as tests", () => {
  test('no sentence on the page calls post-quantum cryptography stronger', async ({ page }) => {
    await boot(page)
    await page.locator('#key-owner-impostor').check()
    await page.locator('#break-toggle').click()

    // THE ONE THING THIS LAB MUST NOT DO. Every sentence that uses the word has to
    // carry its own negation, because a reader who skims one sentence out of
    // context is exactly the reader this rule exists for. Checked over the driven
    // page, not the static HTML, so generated verdict text is included.
    const text = await fullText(page)
    const sentences = text.split(/(?<=[.!?])\s+/)
    const offending = sentences
      .filter((s) => /\bstronger?\b/i.test(s))
      .filter((s) => !/\b(not|never|nothing)\b/i.test(s))
    expect(offending, 'every "stronger" sentence must negate itself').toEqual([])
    expect(
      sentences.some((s) => /\bstronger\b/i.test(s)),
      'the refusal must actually be stated, not merely absent',
    ).toBe(true)

    // And no computed verdict may use the word at all: a verdict is the one line a
    // reader is most likely to take away whole.
    for (const verdict of await page.locator('[data-verdict]').all()) {
      expect(await verdict.innerText()).not.toMatch(/\bstrong/i)
    }
  })

  test('the hidden maths words appear only in the one sentence pointing at Lattice Gentle', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('#key-owner-impostor').check()
    await page.locator('#break-toggle').click()

    // The brief forbids lattice, LWE, polynomial, ring and NTT anywhere on the page
    // except one sentence pointing at the lab that teaches them. This is a
    // Beginner lab and that boundary is the reason it can be one.
    const text = await fullText(page)
    for (const word of [/\bLWE\b/i, /\bpolynomials?\b/i, /\brings?\b/i, /\bNTT\b/i]) {
      expect(word.test(text), `${word} must not appear on the page`).toBe(false)
    }

    const latticeSentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => /\blattice\b/i.test(s))
    expect(latticeSentences.length, 'lattice may appear in exactly one sentence').toBe(1)
    expect(latticeSentences[0]).toContain('Lattice Gentle')

    // And that sentence must actually link there, rather than name it in prose.
    await expect(
      page.locator('a[href*="crypto-lab-lattice-gentle"]'),
    ).toHaveCount(1)
  })

  test('the page does not blame the size for why deployments run both exchanges', async ({
    page,
  }) => {
    await boot(page)
    // A correction to this page's own earlier wording. Hybrid deployments hedge the
    // risk that ML-KEM turns out to be weak; they cost MORE bytes rather than
    // fewer, so attributing them to the size increase is backwards. The sentence
    // that got this wrong linked Downgrade Wire and then drew the wrong conclusion
    // from it, which is the shape of a plausible-sounding falsehood.
    await fullText(page)
    const sizes = page.locator('#panel-sizes')
    await expect(sizes).toContainText("It is not why today's deployments run both exchanges")
    await expect(sizes).toContainText('a hedge against being wrong, not a fix for the size')
  })

  test('the harvest story records the encrypted bytes, not only the public values', async ({
    page,
  }) => {
    await boot(page)
    // An observer who kept only the two public values would have nothing to
    // decrypt later. The story has to say the recording includes the traffic, or it
    // teaches a threat model that cannot work.
    const story = page.locator('#panel-story')
    await expect(story).toContainText('the encrypted bytes of everything you said')
    await expect(story).toContainText('use that secret to decrypt the conversation they already have')
  })

  test('the page says PQC runs on ordinary computers', async ({ page }) => {
    await boot(page)
    // The misconception next to "stronger": that post-quantum cryptography needs a
    // quantum computer. The intro expands the acronym and denies that in its first
    // two sentences, which is where a beginner actually reads.
    const intro = page.locator('#panel-intro, .intro').first()
    await expect(intro).toContainText('PQC is post-quantum cryptography')
    await expect(intro).toContainText('runs on ordinary computers')
    await expect(intro).toContainText('not the machine it needs')
  })

  test('the quantum claim is scoped to a machine large enough, not to all of them', async ({
    page,
  }) => {
    await boot(page)
    // Quantum computers exist. What does not exist is one big enough to undo
    // X25519, and the page has to say which it means.
    const text = await fullText(page)
    expect(text).toContain('Quantum computers exist')
    expect(text).not.toMatch(/computer that does not exist yet/i)
  })

  test('the page says what is real, what is not shown, and what it does not prove', async ({
    page,
  }) => {
    await boot(page)
    const honesty = page.locator('#panel-honesty')
    await expect(honesty).toBeVisible()
    await expect(honesty).toContainText('This is a teaching demo, not production cryptography')
    // The provenance distinction the repository keeps: NIST's ACVP vectors for
    // ML-KEM and RFC 7748's own worked example for X25519 are different kinds of
    // evidence, and the page says so rather than calling both "spec vectors".
    await fullText(page)
    await expect(honesty).toContainText("NIST's\npublished ACVP test vectors")
    await expect(honesty).toContainText('RFC 7748')
    await expect(honesty).toContainText('Nothing here breaks X25519')
    await expect(honesty).toContainText('nothing here runs a quantum algorithm')
  })
})

test.describe('the disclosure boundary', () => {
  test('the disclosures ship shut, and open through a real summary', async ({ page }) => {
    await boot(page)
    const summaries = page.locator('#app details > summary')
    const count = await summaries.count()
    expect(count).toBeGreaterThan(0)
    await expect(page.locator('#app details[open]')).toHaveCount(0)
    // Keyboard-operable with no ARIA, because it is a real <summary>.
    await summaries.first().focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#app details[open]')).toHaveCount(1)
  })

  test('nothing load-bearing is hidden behind a disclosure', async ({ page }) => {
    await boot(page)
    // Progressive disclosure must not hide the qualifications that make an exhibit
    // truthful. These four are the ones that may never move behind a summary:
    // the brief's one hard rule, the teaching-demo line, the scope of the quantum
    // claim, and §4.1d's negative claim. Asserting they are VISIBLE at arrival is
    // the check; asserting they have no <details> ancestor is why it cannot be
    // satisfied by a disclosure that happens to be open.
    const loadBearing: readonly [string, string][] = [
      ['.callout-rule', 'the "not a stronger lock" rule'],
      ['.honesty-lead', 'the teaching-demo line'],
      ['[data-limitation="authentication"]', "§4.1d's negative claim"],
    ]
    for (const [selector, what] of loadBearing) {
      const el = page.locator(selector)
      await expect(el, `${what} must be on the page`).toHaveCount(1)
      await expect(el, `${what} must be visible at arrival`).toBeVisible()
      expect(
        await el.evaluate((node) => node.closest('details') !== null),
        `${what} must not be behind a disclosure`,
      ).toBe(false)
    }
    // And the quantum scoping, which is prose rather than a component.
    await expect(page.locator('#panel-intro')).toContainText('Quantum computers exist')
    expect(
      await page
        .locator('#panel-intro')
        .evaluate((node) => node.querySelector('details')?.textContent?.includes('Quantum computers exist') ?? false),
    ).toBe(false)
  })
})

test.describe('structural probes the a11y gate cannot answer', () => {
  test('nothing paints while the code believes it is hidden', async ({ page }) => {
    await boot(page)
    await page.locator('#key-owner-impostor').check()
    await page.locator('#break-toggle').click()

    // THE [hidden] CASCADE TRAP (§4.1). A class rule that sets `display` outranks
    // the UA `[hidden]` rule, so an element can paint while the code that set the
    // attribute believes it is gone. Four live instances were found across this
    // fleet in a single day.
    //
    // This lab has NO hidden elements — all five panels are on one scrolling page —
    // so the probe is vacuous today and both halves are asserted so that the
    // vacuity is a measurement rather than an assumption.
    const painting = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[hidden]'))
        .filter((el) => (el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }))
        .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`),
    )
    expect(painting, 'an element may not paint while carrying [hidden]').toEqual([])
    await expect(page.locator('[hidden]')).toHaveCount(0)
  })
})
