import { hexPrefix } from '../exchange/bytes.js'
import { corruptOneByte, outcomeOfBrokenBox, type PqExchange } from '../exchange/mlkem.js'
import { formatBytes } from '../exchange/sizes.js'
import { clear, el } from './dom.js'
import { createPrediction, gradePrediction } from './predict.js'
import { createVerdict } from './verdict.js'

/**
 * Panel 3 — break one byte of the sealed box and open it anyway.
 *
 * THE VISUAL RULE THE BRIEF SETS FOR THIS PANEL: the mismatched secrets must read
 * as A DIFFERENCE, NOT AN ERROR. Nothing crashed, and that is exactly the trap. So
 * the verdict tone is `trap` — its own colour, its own glyph (not-equal, not a
 * cross) — and never `alarm`, which this page reserves for a state that reports
 * success while being compromised. A red error badge here would teach a beginner
 * that the system caught the tampering. It did not. Nothing caught it.
 *
 * THE TWO SECRETS ARE SHOWN SIDE BY SIDE AND COMPARED, rather than described in a
 * sentence. Template §2 asks for compute-both-sides-and-compare over assertion, and
 * the mismatch is this panel's entire content. The "did ML-KEM report an error"
 * row is deliberately SEPARATE from the match row, because they are two
 * independent facts and collapsing them is how a reader concludes that ML-KEM
 * detects tampering.
 *
 * THREE STATES, ONE MARKER. The marker `byte-flip` is on screen from first paint:
 * untouched (pass), broken (trap), and retired when panel 2 has been re-run and
 * this result is about an exchange that no longer exists. One marker across all
 * three means the reader never loses the verdict and the coverage spec never has to
 * guess which state to drive to.
 *
 * ONE BUTTON, NOT TWO, AND IT IS NEVER REPLACED. The earlier version swapped the
 * button element out when the mode changed, which destroyed the node a keyboard
 * reader had just activated: measured on the shipped build, pressing Enter on
 * "Change one byte" left `document.activeElement` on `<body>`, and so did "Put the
 * byte back". The reader loses their place in the page at the exact moment the
 * thing they asked for happens. A single stable button whose label and `data-mode`
 * change keeps focus where the reader put it, which is also why this panel needs no
 * refocus call at all.
 */
export interface BreakPanelState {
  /** Re-render against a new exchange from panel 2; a broken result is retired. */
  readonly reset: (exchange: PqExchange, run: number) => void
}

type Mode = 'untouched' | 'broken' | 'retired'

const BYTE_INDEX = 537
const BIT_MASK = 0x02

/**
 * The three things a beginner guesses, in plain language, and the sentence each one
 * reads as when it is quoted back to them.
 *
 * Two of these are wrong, and they are wrong because of what FIPS 203 specifies —
 * not because this page decided so. Which one is right is read off the run by
 * `outcomeOfBrokenBox`, never from this object.
 */
const BREAK_OUTCOMES: Record<string, string> = {
  error: 'ML-KEM would raise an error.',
  differ: 'The two secrets would end up different.',
  nothing: 'Nothing would change — the secrets would still match.',
}

export function createBreakPanel(
  into: HTMLElement,
  exchange: PqExchange,
  run: number,
): BreakPanelState {
  let current = exchange
  let currentRun = run
  let mode: Mode = 'untouched'

  const compare = el('div', { class: 'compare' })
  const verdict = createVerdict('byte-flip')
  const predict = createPrediction({
    id: 'break',
    verdictId: 'break-prediction',
    legend: 'Before you press it — what do you think one changed byte does?',
    options: [
      { value: 'error', label: BREAK_OUTCOMES.error },
      { value: 'differ', label: BREAK_OUTCOMES.differ },
      { value: 'nothing', label: BREAK_OUTCOMES.nothing },
    ],
    // Re-grade in place when the guess changes, so a reader who changes their mind
    // after seeing the result gets an honest answer rather than a stale one.
    onChange: () => render(mode),
  })
  const button = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    id: 'break-toggle',
  }) as HTMLButtonElement

  button.addEventListener('click', () => {
    // The same node handles both directions, so focus simply stays on it.
    render(mode === 'broken' ? 'untouched' : 'broken')
  })

  into.append(predict.el, predict.verdict.el, compare, verdict.el, button)

  /** Two secrets, labelled, with the comparison and the error question apart. */
  const renderCompare = (
    rae: string,
    dev: string,
    matches: boolean,
    errorReported: boolean | null,
  ): void => {
    clear(compare)
    const side = (name: string, value: string): HTMLElement =>
      el(
        'div',
        { class: 'compare-side' },
        el('span', { class: 'compare-label' }, `${name} now holds`),
        el('p', { class: 'compare-value', 'data-held': name.toLowerCase() }, `${value}…`),
      )
    compare.append(
      el('div', { class: 'compare-pair' }, side('Rae', rae), side('Dev', dev)),
      el(
        'dl',
        { class: 'compare-facts' },
        el('dt', {}, 'Do the two secrets match?'),
        el(
          'dd',
          { 'data-fact': 'match' },
          matches ? 'Yes — all 32 bytes.' : 'No — they differ.',
        ),
        el('dt', {}, 'Did ML-KEM report an error?'),
        el(
          'dd',
          { 'data-fact': 'error' },
          errorReported === null
            ? 'Nothing has been opened yet.'
            : errorReported
              ? 'Yes — it raised one.'
              : 'No. It returned a secret and said nothing.',
        ),
      ),
    )
  }

  /**
   * Grade the guess against what the run MEASURED.
   *
   * `outcomeOfBrokenBox` is the answer key and it comes from the exchange, so this
   * cannot drift from what the facts rows above it report. Before the byte has been
   * changed there is no outcome to grade against, so the marker waits.
   */
  const grade = (outcome: string | null): void => {
    predict.verdict.set(
      outcome === null
        ? gradePrediction({
            guess: null,
            actual: '',
            outcomes: BREAK_OUTCOMES,
            run: currentRun,
            because: 'Nothing has been changed yet, so there is nothing to grade.',
          })
        : gradePrediction({
            guess: predict.value(),
            actual: outcome,
            outcomes: BREAK_OUTCOMES,
            run: currentRun,
            because:
              'FIPS 203 specifies that a ciphertext which does not re-encrypt to itself ' +
              'yields a secret derived from a per-key rejection value. A well-formed secret, ' +
              'just not the other side\u2019s one, and no error to go with it.',
          }),
    )
  }

  function render(next: Mode): void {
    mode = next

    if (mode === 'retired') {
      renderCompare(
        hexPrefix(current.raeSharedSecret),
        hexPrefix(current.devSharedSecret),
        true,
        null,
      )
      verdict.set({
        tone: 'retired',
        run: currentRun,
        headline: 'That result belongs to the previous exchange',
        detail:
          'Panel 2 ran again, so the sealed box that result was about no longer exists. The ' +
          'values above are the new exchange, untouched. Change a byte of it to see the ' +
          'comparison again.',
      })
      button.textContent = 'Change one byte of the new sealed box'
      button.setAttribute('data-mode', 'break')
      grade(null)
      return
    }

    if (mode === 'untouched') {
      renderCompare(
        hexPrefix(current.raeSharedSecret),
        hexPrefix(current.devSharedSecret),
        true,
        null,
      )
      verdict.set({
        tone: 'pass',
        run: currentRun,
        headline: 'Nothing has been changed yet',
        detail:
          `The sealed box from panel 2 is ${formatBytes(current.cipherText.length)} bytes and is ` +
          `untouched, so Rae and Dev hold the same ${current.raeSharedSecret.length} bytes. ` +
          'Change one byte of it and watch what happens to the pair above.',
      })
      button.textContent = 'Change one byte of the sealed box'
      button.setAttribute('data-mode', 'break')
      grade(null)
      return
    }

    const broken = corruptOneByte(current, BYTE_INDEX, BIT_MASK)
    renderCompare(
      broken.threw ? '(nothing — it threw)' : hexPrefix(broken.raeSharedSecret),
      hexPrefix(broken.devSharedSecret),
      broken.secretsMatch,
      broken.threw,
    )
    verdict.set(
      broken.threw
        ? {
            tone: 'alarm',
            run: currentRun,
            headline: 'Opening the box raised an error',
            detail:
              'This page says ML-KEM returns a different secret rather than failing. On this run ' +
              'it failed instead, so the claim on this page is wrong and should not be trusted.',
          }
        : broken.secretsMatch
          ? {
              tone: 'alarm',
              run: currentRun,
              headline: 'The two secrets still match',
              detail:
                `Byte ${broken.byteIndex} of the sealed box was changed and the two sides still ` +
                'agree. That is not how this works, so something on this page is wrong.',
            }
          : {
              tone: 'trap',
              run: currentRun,
              headline: 'Different secrets — and nothing reported a failure',
              detail:
                `Byte ${broken.byteIndex} of ${formatBytes(current.cipherText.length)} was ` +
                `changed. Rae's value is a full ${broken.raeSharedSecret.length} bytes, exactly ` +
                'as well-formed as before, and it is not the same secret. No error was raised ' +
                'and no exception was thrown.',
            },
    )
    button.textContent = 'Put the byte back'
    button.setAttribute('data-mode', 'restore')
    grade(outcomeOfBrokenBox(broken))
  }

  render('untouched')

  return {
    reset(next, nextRun) {
      // Retirement is for a result that EXISTED. A reader who never broke a byte
      // has nothing to retire, and telling them a result was retired would be the
      // page reporting an event that did not happen. A broken result, though, is
      // about a sealed box that no longer exists, and must be TOLD to go rather
      // than quietly replaced by a fresh one (§4.1b).
      const retiring = mode === 'broken'
      current = next
      currentRun = nextRun
      render(retiring ? 'retired' : 'untouched')
    },
  }
}
