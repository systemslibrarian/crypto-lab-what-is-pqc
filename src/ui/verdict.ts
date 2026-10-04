import { el } from './dom.js'

/**
 * Every outcome this page renders goes through here, and nothing renders an
 * outcome any other way.
 *
 * WHY ONE FUNCTION
 *
 * Three rules have to hold for every outcome on the page, and each of them is a
 * rule a hand-written block would break eventually:
 *
 *  - STATE IS NEVER CARRIED BY COLOUR ALONE (WCAG 1.4.1). Each verdict gets a
 *    glyph, a word, and a colour. The glyph is `aria-hidden` because the word
 *    beside it says the same thing; a screen reader that announced "check mark
 *    same secret on both sides" would be reading the decoration twice.
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
 */
export type Tone = 'pass' | 'trap' | 'alarm' | 'retired'

const GLYPH: Record<Tone, string> = {
  pass: '✓', // check mark
  trap: '≠', // not equal — a difference, not an error (the brief's rule)
  alarm: '!', // exclamation — reports success and is compromised anyway
  retired: '—', // em dash — this verdict is no longer about anything
}

export interface Verdict {
  /** Stable marker id. Named in e2e/verdict-mutations.json. */
  readonly id: string
  readonly tone: Tone
  /** Short, upper-case, and the whole claim: a reader should be able to stop here. */
  readonly headline: string
  /** One sentence of plain language carrying the numbers the headline summarises. */
  readonly detail: string
}

export function renderVerdict(verdict: Verdict): HTMLElement {
  const wrap = el('div', {
    class: 'verdict',
    'data-verdict': verdict.id,
    'data-tone': verdict.tone,
    // Async in the sense that matters: these are rewritten in place when the
    // reader presses a button, so a screen reader has to be told (§4.2).
    role: 'status',
    'aria-live': 'polite',
  })
  wrap.append(
    el('span', { class: 'verdict-glyph', 'aria-hidden': 'true' }, GLYPH[verdict.tone]),
    el(
      'p',
      { class: 'verdict-text' },
      el('span', { class: 'verdict-headline' }, verdict.headline),
      el('span', { class: 'verdict-detail' }, verdict.detail),
    ),
  )
  return wrap
}
