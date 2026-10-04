import { hexPrefix } from '../exchange/bytes.js'
import { runImpostorExchange } from '../exchange/mlkem.js'
import { formatBytes } from '../exchange/sizes.js'
import { clear, el } from './dom.js'
import { renderVerdict } from './verdict.js'

/**
 * Panel 4 — the negative claim, and the state that proves it is a result rather
 * than a disclaimer (template §4.1d).
 *
 * THE NEGATIVE CLAIM: running ML-KEM establishes nothing about who is on the other
 * end. Scoped to the construction on this page — a bare KEM exchange — and not to
 * post-quantum cryptography in general, which has authenticated constructions.
 *
 * THE EVIDENCE FIXTURE is the "someone claiming to be Rae" option. In that state
 * every check this page performs reports success: the exchange completes, both
 * sides match, the sizes are the published sizes, and the round trip verifies. And
 * the named property is violated anyway — Rae was never involved. The verdict
 * reads as success and failure at once, because that is the honest reading.
 *
 * THERE IS NO FAILURE CODE, AND THE ABSENCE IS THE EXHIBIT. ML-KEM has nothing to
 * raise here; it was never asked to check whose key it was. Inventing a warning
 * that the primitive does not actually produce would teach the opposite of the
 * lesson, so the page says plainly that nothing failed and names what is missing.
 */
export interface OwnerPanelState {
  /** The run serial, so a no-op interaction can be told from a real re-run. */
  readonly run: () => number
}

type Owner = 'rae' | 'impostor'

/** The negative claim, in one sentence. Asserted on screen by claims.spec.ts. */
export const NEGATIVE_CLAIM =
  'ML-KEM agreed on a secret and proved nothing about who is holding the other end of it.'

export function createOwnerPanel(into: HTMLElement): OwnerPanelState {
  let selected: Owner = 'rae'
  let runSerial = 0

  const render = (): void => {
    runSerial += 1
    const impostor = selected === 'impostor'
    const result = runImpostorExchange(impostor)

    clear(into)

    const options = el('div', { class: 'choice-options' })
    const option = (value: Owner, text: string, note: string): HTMLElement => {
      const input = el('input', {
        type: 'radio',
        name: 'key-owner',
        value,
        id: `key-owner-${value}`,
      }) as HTMLInputElement
      input.checked = selected === value
      input.addEventListener('change', () => {
        // THE NO-OP GUARD (§4.1b). A change event for the value already selected
        // must not re-run the exchange: re-selecting the same option would
        // otherwise throw away a verdict the reader is still reading, and the run
        // serial on the verdict is how a test can tell the difference.
        if (selected === value) return
        selected = value
        render()
        document.getElementById(`key-owner-${value}`)?.focus()
      })
      return el(
        'label',
        { class: 'choice-option', for: `key-owner-${value}` },
        input,
        el(
          'span',
          { class: 'choice-option-text' },
          text,
          el('span', { class: 'choice-option-note' }, note),
        ),
      )
    }

    options.append(
      option('rae', 'Rae handed Dev the key herself.', 'The ordinary case.'),
      option(
        'impostor',
        'Someone handed Dev a key and said it was Rae’s.',
        'Dev has no way, from the key alone, to tell the difference.',
      ),
    )

    // THE VERDICT IS COMPUTED FROM WHAT WAS MEASURED, never from the option the
    // reader picked. Those two agree today, and the difference is the whole value
    // of the exhibit: if the exchange ever reached Rae while the page was telling
    // the reader it had not, that would be the page asserting its lesson rather
    // than showing it — which is the failure mode this fleet's teaching standard
    // calls "tell, not show". A mutation that makes the impostor branch quietly
    // use Rae's own key is caught here and nowhere else.
    const verdict = !result.secretsMatch
      ? renderVerdict({
          id: 'key-owner',
          tone: 'alarm',
          headline: 'The exchange did not agree at all',
          detail:
            'Dev and the owner of the key Dev used should always reach the same secret, ' +
            'whoever that owner is. They did not, so something on this page is wrong and ' +
            'nothing below should be trusted.',
        })
      : !result.raeHoldsTheSecret
      ? renderVerdict({
          id: 'key-owner',
          tone: 'alarm',
          headline: 'Same secret on both sides — and Rae is not one of them',
          detail:
            `Dev sealed a box to the key they were given and holds ` +
            `${hexPrefix(result.devSharedSecret)}. The person who actually owns that key holds ` +
            `the same ${result.devSharedSecret.length} bytes. Rae, who Dev believes they are ` +
            `talking to, holds something else entirely. The key was ` +
            `${formatBytes(result.publicKeyBytes)} bytes and the box was ` +
            `${formatBytes(result.cipherTextBytes)} bytes, exactly as in panel 2. Every check ` +
            'on this page passed. Nothing failed, and nothing could have: ' +
            NEGATIVE_CLAIM,
        })
      : renderVerdict({
          id: 'key-owner',
          tone: 'pass',
          headline: 'Same secret on both sides, and this time it really is Rae',
          detail:
            `Dev holds ${hexPrefix(result.devSharedSecret)} and so does Rae. Note what made ` +
            'that true: not the exchange, which behaved identically either way, but the fact ' +
            'that the key came from the right person. Switch the option above and watch every ' +
            'check still pass.',
        })
    verdict.setAttribute('data-run', String(runSerial))
    verdict.setAttribute('data-owner', result.keyOwner.toLowerCase())

    const limit = el(
      'div',
      { class: 'callout', 'data-limitation': 'authentication' },
      el('span', { class: 'callout-icon', 'aria-hidden': 'true' }, '!'),
      el(
        'p',
        {},
        el('strong', {}, 'What ML-KEM does not do for you. '),
        NEGATIVE_CLAIM,
        ' There is no error code for this and there is no missing check — an exchange is not an ' +
          'introduction. Proving who is on the other end is a separate job done by a separate ' +
          'primitive: something signs the key, or a transcript binds it to an identity. A reader ' +
          'who leaves here thinking "post-quantum" means "safe" has been taught wrongly.',
      ),
    )

    into.append(
      el(
        'fieldset',
        { class: 'choice' },
        el('legend', { class: 'choice-legend' }, 'Who gave Dev the key?'),
        options,
      ),
      verdict,
      limit,
    )
  }

  render()

  return { run: () => runSerial }
}
