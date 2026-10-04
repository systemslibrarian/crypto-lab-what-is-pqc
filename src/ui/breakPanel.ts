import { hexPrefix } from '../exchange/bytes.js'
import { corruptOneByte, type PqExchange } from '../exchange/mlkem.js'
import { formatBytes } from '../exchange/sizes.js'
import { clear, el } from './dom.js'
import { renderVerdict } from './verdict.js'

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
 * THREE STATES, ONE MARKER. The marker `byte-flip` is on screen from first paint:
 * untouched (pass), broken (trap), and retired when panel 2 has been re-run and
 * this result is about an exchange that no longer exists. One marker across all
 * three means the reader never loses the verdict and the coverage spec never has
 * to guess which state to drive to.
 */
export interface BreakPanelState {
  /** Re-render against a new exchange from panel 2; a broken result is retired. */
  readonly reset: (exchange: PqExchange, run: number) => void
}

type Mode = 'untouched' | 'broken' | 'retired'

const BYTE_INDEX = 537
const BIT_MASK = 0x02

export function createBreakPanel(into: HTMLElement, exchange: PqExchange, run: number): BreakPanelState {
  let current = exchange
  let currentRun = run
  let mode: Mode = 'untouched'

  const render = (next: Mode): void => {
    mode = next
    clear(into)

    if (mode === 'retired') {
      const verdict = renderVerdict({
        id: 'byte-flip',
        tone: 'retired',
        headline: 'Retired — panel 2 ran again',
        detail:
          'This result was about the sealed box from the previous run of panel 2, and that box ' +
          'no longer exists. Break a byte of the new one to see it again.',
      })
      verdict.setAttribute('data-run', String(currentRun))
      into.append(verdict, breakButton())
      return
    }

    if (mode === 'untouched') {
      const verdict = renderVerdict({
        id: 'byte-flip',
        tone: 'pass',
        headline: 'Nothing has been changed yet',
        detail:
          `The sealed box from panel 2 is ${formatBytes(current.cipherText.length)} bytes and is ` +
          `untouched. Rae holds ${hexPrefix(current.raeSharedSecret)} and Dev holds ` +
          `${hexPrefix(current.devSharedSecret)}, which are the same ` +
          `${current.raeSharedSecret.length} bytes.`,
      })
      verdict.setAttribute('data-run', String(currentRun))
      into.append(verdict, breakButton())
      return
    }

    const broken = corruptOneByte(current, BYTE_INDEX, BIT_MASK)
    const verdict = broken.threw
      ? renderVerdict({
          id: 'byte-flip',
          tone: 'alarm',
          headline: 'Opening the box raised an error',
          detail:
            'This page says ML-KEM returns a different secret rather than failing. On this run ' +
            'it failed instead, so the claim on this page is wrong and should not be trusted.',
        })
      : renderVerdict({
          id: 'byte-flip',
          tone: broken.secretsMatch ? 'alarm' : 'trap',
          headline: broken.secretsMatch
            ? 'The two secrets still match'
            : 'Different secrets — and nothing reported a failure',
          detail: broken.secretsMatch
            ? `Byte ${broken.byteIndex} of the sealed box was changed and the two sides still ` +
              'agree. That is not how this works, so something on this page is wrong.'
            : `Byte ${broken.byteIndex} of ${formatBytes(current.cipherText.length)} was changed. ` +
              `Rae now holds ${hexPrefix(broken.raeSharedSecret)}; Dev still holds ` +
              `${hexPrefix(broken.devSharedSecret)}. Rae's value is a full ` +
              `${broken.raeSharedSecret.length} bytes, exactly as well-formed as before, and it ` +
              'is not the same secret. No error was raised and no exception was thrown.',
        })
    verdict.setAttribute('data-run', String(currentRun))

    const again = el('button', { class: 'btn', type: 'button', id: 'break-reset' }, 'Put the byte back')
    again.addEventListener('click', () => render('untouched'))
    into.append(verdict, again)
  }

  const breakButton = (): HTMLElement => {
    const button = el(
      'button',
      { class: 'btn btn-primary', type: 'button', id: 'break-run' },
      'Change one byte of the sealed box',
    )
    button.addEventListener('click', () => render('broken'))
    return button
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
