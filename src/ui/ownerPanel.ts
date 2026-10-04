import { hexPrefix } from '../exchange/bytes.js'
import {
  outcomeOfOwnerExchange,
  runImpostorExchange,
  type ImpostorExchange,
} from '../exchange/mlkem.js'
import { formatBytes } from '../exchange/sizes.js'
import { clear, el } from './dom.js'
import { createPrediction, gradePrediction } from './predict.js'
import { createVerdict } from './verdict.js'

/**
 * Panel 4 — the negative claim, and the state that proves it is a result rather
 * than a disclaimer (template §4.1d).
 *
 * THE NEGATIVE CLAIM: running ML-KEM establishes nothing about who is on the other
 * end. Scoped to the construction on this page — a bare, unauthenticated KEM
 * exchange — and not to post-quantum cryptography in general, which has
 * authenticated constructions.
 *
 * THE EVIDENCE FIXTURE is the "someone claiming to be Rae" option. In that state
 * every check this page performs reports success: the exchange completes, both
 * sides match, the sizes are the published sizes, and the round trip verifies. And
 * the named property is violated anyway — Rae was never involved. The verdict reads
 * as success and failure at once, because that is the honest reading.
 *
 * THERE IS NO FAILURE CODE, AND THE ABSENCE IS THE EXHIBIT. ML-KEM has nothing to
 * raise here; it was never asked whose key it was. Inventing a warning the
 * primitive does not produce would teach the opposite of the lesson, so the page
 * says plainly that nothing failed and names what is missing.
 *
 * AND IT IS NOT A FLAW IN ML-KEM. An unauthenticated X25519 exchange — panel 1,
 * exactly as shown — has the same hole for the same reason. Letting a reader leave
 * thinking authentication is something post-quantum cryptography specifically lacks
 * would be a new misunderstanding traded for the one this lab came to fix, so the
 * panel says so.
 *
 * The controls are built ONCE and never rebuilt. The earlier version re-rendered
 * the whole fieldset on every change, which destroyed the radio the reader had just
 * operated and needed an explicit refocus call to put focus back. Not rebuilding is
 * both simpler and the reason there is nothing to put back.
 */
export interface OwnerPanelState {
  /** The run serial, so a no-op interaction can be told from a real re-run. */
  readonly run: () => number
}

type Owner = 'rae' | 'impostor'

/**
 * The three guesses, and the sentence each reads as when quoted back.
 *
 * `warn` is the one worth offering. It is what most people expect — something in the
 * stack will surely notice — and this construction has no way to produce it. Which of
 * the three is right is read off the run by `outcomeOfOwnerExchange`, never from here.
 */
const OWNER_OUTCOMES: Record<string, string> = {
  fail: 'The checks on this page would fail.',
  pass: 'The checks on this page would all pass.',
  warn: 'ML-KEM would warn that the key is not Rae\u2019s.',
}

/** The negative claim, in one sentence. Asserted on screen by claims.spec.ts. */
export const NEGATIVE_CLAIM =
  'ML-KEM agreed on a secret and proved nothing about who is holding the other end of it.'

export function createOwnerPanel(into: HTMLElement): OwnerPanelState {
  let selected: Owner = 'rae'
  let runSerial = 0
  let lastImpostor: ImpostorExchange | null = null

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
      // THE NO-OP GUARD (§4.1b). A change event for the value already selected must
      // not re-run the exchange: re-selecting the same option would otherwise throw
      // away a verdict the reader is still reading, and the run serial on the
      // verdict is how a test can tell the difference.
      if (selected === value) return
      selected = value
      update()
      grade()
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

  const who = el('div', { class: 'who' })
  const verdict = createVerdict('key-owner')
  const predict = createPrediction({
    id: 'owner',
    verdictId: 'owner-prediction',
    legend:
      'Before you switch it — if someone hands Dev a key and says it is Rae\u2019s, what happens?',
    options: [
      { value: 'fail', label: OWNER_OUTCOMES.fail },
      { value: 'pass', label: OWNER_OUTCOMES.pass },
      { value: 'warn', label: OWNER_OUTCOMES.warn },
    ],
    onChange: () => grade(),
  })
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
        'primitive: something signs the key, or a transcript binds it to an identity. This is ' +
        'not a post-quantum shortcoming either: panel 1, exactly as shown, has the same hole ' +
        'for the same reason. A reader who leaves here thinking "post-quantum" means "safe" has ' +
        'been taught wrongly.',
    ),
  )

  into.append(
    predict.el,
    predict.verdict.el,
    el(
      'fieldset',
      { class: 'choice' },
      el('legend', { class: 'choice-legend' }, 'Who gave Dev the key?'),
      options,
    ),
    who,
    verdict.el,
    limit,
  )

  /**
   * Grade the guess against what the IMPOSTOR run measured.
   *
   * Graded only once the reader has actually switched to the impostor option: the
   * question is about that state, and grading it while the honest key is selected
   * would be marking a guess against a run that did not test it. `lastImpostor`
   * holds the most recent impostor result so a changed guess re-grades against the
   * same run rather than silently generating a new one.
   */
  function grade(): void {
    predict.verdict.set(
      lastImpostor === null
        ? gradePrediction({
            guess: null,
            actual: '',
            outcomes: OWNER_OUTCOMES,
            run: runSerial,
            because:
              'Pick one, then choose the second option below to find out. Nothing is scored.',
          })
        : gradePrediction({
            guess: predict.value(),
            actual: outcomeOfOwnerExchange(lastImpostor),
            outcomes: OWNER_OUTCOMES,
            run: runSerial,
            because:
              'ML-KEM was never asked whose key it was, so it has nothing to object to. A bare ' +
              'KEM exchange has exactly one way to tell a caller something is wrong \u2014 raising ' +
              'an exception \u2014 and the standard does not use it here.',
          }),
    )
  }

  function update(): void {
    runSerial += 1
    const impostor = selected === 'impostor'
    const result = runImpostorExchange(impostor)
    if (impostor) lastImpostor = result

    // Three participants, drawn rather than described. In the impostor state the
    // relationship a reader has to see is that Dev's partner is NOT the person Dev
    // named, and burying that in a long sentence is how it gets skimmed past.
    clear(who)
    const card = (
      name: string,
      role: string,
      held: string | null,
      state: 'holds' | 'absent',
    ): HTMLElement =>
      el(
        'div',
        { class: `who-card who-${state}`, 'data-who': name.toLowerCase() },
        el('p', { class: 'who-name' }, name),
        el('p', { class: 'who-role' }, role),
        el(
          'p',
          { class: 'who-held' },
          held === null ? 'Holds no part of this secret.' : `Holds ${held}…`,
        ),
      )
    who.append(
      card('Dev', 'Sealed a box to the key they were given.', hexPrefix(result.devSharedSecret), 'holds'),
      card(
        impostor ? 'Mal' : 'Rae',
        impostor ? 'Actually owns that key.' : 'Owns that key, and Dev meant to reach her.',
        hexPrefix(result.ownerSharedSecret),
        'holds',
      ),
      ...(impostor
        ? [card('Rae', 'The person Dev believes they are talking to.', null, 'absent')]
        : []),
    )

    // THE VERDICT IS COMPUTED FROM WHAT WAS MEASURED, never from the option the
    // reader picked. Those two agree today, and the difference is the whole value
    // of the exhibit: if the exchange ever reached Rae while the page was telling
    // the reader it had not, that would be the page asserting its lesson rather
    // than showing it — which is the failure mode this fleet's teaching standard
    // calls "tell, not show". A mutation that makes the impostor branch quietly use
    // Rae's own key is caught here and nowhere else.
    verdict.set(
      !result.secretsMatch
        ? {
            tone: 'alarm',
            run: runSerial,
            attrs: { 'data-owner': result.keyOwner.toLowerCase() },
            headline: 'The exchange did not agree at all',
            detail:
              'Dev and the owner of the key Dev used should always reach the same secret, ' +
              'whoever that owner is. They did not, so something on this page is wrong and ' +
              'nothing below should be trusted.',
          }
        : !result.raeHoldsTheSecret
          ? {
              tone: 'alarm',
              run: runSerial,
              attrs: { 'data-owner': result.keyOwner.toLowerCase() },
              headline: 'Same secret on both sides — and Rae is not one of them',
              detail:
                `Dev and the person who actually owns that key hold the same ` +
                `${result.devSharedSecret.length} bytes. Rae holds something else entirely. The ` +
                `key was ${formatBytes(result.publicKeyBytes)} bytes and the box was ` +
                `${formatBytes(result.cipherTextBytes)} bytes, exactly as in panel 2. Every check ` +
                'on this page passed. Nothing failed, and nothing could have: ' +
                NEGATIVE_CLAIM,
            }
          : {
              tone: 'pass',
              run: runSerial,
              attrs: { 'data-owner': result.keyOwner.toLowerCase() },
              headline: 'Same secret on both sides, and this time it really is Rae',
              detail:
                `Dev holds ${hexPrefix(result.devSharedSecret)} and so does Rae. Note what made ` +
                'that true: not the exchange, which behaved identically either way, but the fact ' +
                'that the key came from the right person. Switch the option above and watch every ' +
                'check still pass.',
            },
    )
  }

  update()
  grade()

  return { run: () => runSerial }
}
