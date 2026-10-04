import { el } from './dom.js'

/**
 * Every outcome this page renders goes through here, and nothing renders an
 * outcome any other way.
 *
 * WHY ONE FUNCTION
 *
 * Three rules have to hold for every outcome on the page, and each is a rule a
 * hand-written block would break eventually:
 *
 *  - STATE IS NEVER CARRIED BY COLOUR ALONE (WCAG 1.4.1). Each verdict gets a
 *    glyph, a word, and a colour. The glyph is `aria-hidden` because the word
 *    beside it says the same thing; a screen reader announcing "check mark same
 *    secret on both sides" would be reading the decoration twice.
 *
 *  - EVERY OUTCOME IS MACHINE-ADDRESSABLE. `data-verdict` names the marker and
 *    `data-tone` carries the judgement, so `e2e/claims.spec.ts` can assert what
 *    the page concluded, `e2e/verdict-coverage.spec.ts` can check that every
 *    marker on screen has a recorded mutation behind it, and
 *    `e2e/verdict-mutations.json` can name a marker as the thing a mutation must
 *    turn red. A verdict painted straight into innerHTML would be invisible to
 *    all three.
 *
 *  - TONE TRACKS SYSTEM INTEGRITY, NOT THE RETURN VALUE (template §1). Panel 3's
 *    corrupted exchange RETURNED successfully and is a `trap`, not a `pass`;
 *    panel 4's impostor exchange returned successfully too and is an `alarm`. A
 *    green verdict on either would be the page lying about what it just did.
 *
 * WHY IT IS A HANDLE AND NOT A RENDER CALL
 *
 * This used to build a fresh element every time a panel re-ran, and a panel
 * re-runs on every button press. That makes `role="status"` close to decorative:
 * the live region a screen reader is observing is REMOVED from the document and a
 * different element with the same attributes is inserted, and an assistive
 * technology watching the old node has nothing to report. The announcement that
 * does or does not happen then depends on timing and on the particular
 * screen-reader/browser pair rather than on the markup.
 *
 * So the element is created once and only its CONTENTS change. Same node, same
 * live region, for the life of the page. `boot()` still counts one marker per id
 * and the claims suite still selects on `[data-verdict]`, so nothing about the
 * testable surface moved — what moved is that the live region is now the thing
 * `aria-live` was specified for.
 *
 * This is a CORRECTNESS fix with an UNVERIFIED benefit, and the distinction
 * matters: a stable node is what the specification is written about, but whether a
 * given screen reader announces these updates usefully has not been checked here.
 * Doing that needs a real screen reader, not a DOM assertion.
 */
export type Tone = 'pass' | 'trap' | 'alarm' | 'retired'

const GLYPH: Record<Tone, string> = {
  pass: '✓', // check mark
  trap: '≠', // not equal — a difference, not an error (the brief's rule)
  alarm: '!', // exclamation — reports success and is compromised anyway
  retired: '—', // em dash — this verdict is no longer about anything
}

export interface VerdictContent {
  readonly tone: Tone
  /** Short, upper-case-ish, and the whole claim: a reader should be able to stop here. */
  readonly headline: string
  /** One sentence of plain language carrying the numbers the headline summarises. */
  readonly detail: string
  /** A run serial, so a test can tell a real re-run from a re-render. */
  readonly run: number
  /** Any extra data attribute this marker carries, e.g. `{ 'data-owner': 'mal' }`. */
  readonly attrs?: Readonly<Record<string, string>>
}

export interface VerdictHandle {
  /** The stable element. Append it once; never replace it. */
  readonly el: HTMLElement
  set(content: VerdictContent): void
}

export function createVerdict(id: string): VerdictHandle {
  const glyph = el('span', { class: 'verdict-glyph', 'aria-hidden': 'true' })
  const headline = el('span', { class: 'verdict-headline' })
  const detail = el('span', { class: 'verdict-detail' })
  const wrap = el(
    'div',
    {
      class: 'verdict',
      'data-verdict': id,
      // The live region is this element, for the life of the page.
      role: 'status',
      'aria-live': 'polite',
    },
    glyph,
    el('p', { class: 'verdict-text' }, headline, detail),
  )

  let previousAttrs: string[] = []

  return {
    el: wrap,
    set(content) {
      wrap.setAttribute('data-tone', content.tone)
      wrap.setAttribute('data-run', String(content.run))
      // Attributes from a previous state are removed rather than left behind: a
      // stale `data-owner` on a marker whose state no longer has an owner is a
      // test passing against something the page is not saying any more.
      for (const name of previousAttrs) {
        if (!(content.attrs && name in content.attrs)) wrap.removeAttribute(name)
      }
      previousAttrs = Object.keys(content.attrs ?? {})
      for (const [name, value] of Object.entries(content.attrs ?? {})) {
        wrap.setAttribute(name, value)
      }
      glyph.textContent = GLYPH[content.tone]
      headline.textContent = content.headline
      detail.textContent = content.detail
    },
  }
}
