import { el } from './dom.js'
import { createVerdict, type VerdictHandle } from './verdict.js'

/**
 * "Before you look — what do you think happens?"
 *
 * WHY A PREDICTION AT ALL. Reading an outcome teaches less than being wrong about
 * it first. Both of this lab's experiments have a result that contradicts what a
 * beginner expects — a corrupted ciphertext that raises nothing, and an impostor
 * exchange that passes every check — and a reader who has already committed to a
 * guess notices the contradiction instead of skimming past it.
 *
 * THE GRADING IS NEVER CANNED. Each panel grades against a value derived from the
 * run it just performed (`outcomeOfBrokenBox`, `outcomeOfOwnerExchange`), not
 * against an answer written down here. A page that graded a guess against a
 * constant would be telling the reader what the answer is, and would go on telling
 * them if the cryptography underneath changed. There is a mutation per prediction
 * verdict for exactly this: re-point the answer key at the wrong outcome and a
 * claims test fails, because the grading is cross-checked against the facts the
 * page prints elsewhere.
 *
 * IT IS UNGRADED IN EVERY OTHER SENSE. No score, no streak, no gate: a reader may
 * ignore it and run the experiment anyway, may change their guess, and may re-run
 * as often as they like. Radios rather than buttons, because this is "pick one of
 * three", which is what a radio group is for and what a screen reader will announce
 * it as — and a real `<fieldset>`/`<legend>` so the question is the group's
 * accessible name rather than an `aria-label` that axe files under `incomplete`.
 */
export interface PredictOption {
  readonly value: string
  readonly label: string
}

export interface PredictHandle {
  /** The fieldset. Append it once. */
  readonly el: HTMLElement
  /** The grading marker. Append it where the result belongs. */
  readonly verdict: VerdictHandle
  /** What the reader guessed, or null if they have not. */
  value(): string | null
}

export function createPrediction(config: {
  /** Short id, used for the radio group name and the control ids. */
  readonly id: string
  /** The verdict marker id this prediction is graded into. */
  readonly verdictId: string
  readonly legend: string
  readonly options: readonly PredictOption[]
  /** Called after a guess changes, so the panel can re-grade in place. */
  readonly onChange: () => void
}): PredictHandle {
  let chosen: string | null = null

  const options = el('div', { class: 'choice-options' })
  for (const option of config.options) {
    const input = el('input', {
      type: 'radio',
      name: `predict-${config.id}`,
      value: option.value,
      id: `predict-${config.id}-${option.value}`,
    }) as HTMLInputElement
    input.addEventListener('change', () => {
      // No no-op guard needed: a radio only fires `change` when the selection
      // actually moves, and re-grading an unchanged guess would be harmless anyway.
      chosen = option.value
      config.onChange()
    })
    options.append(
      el(
        'label',
        { class: 'choice-option', for: `predict-${config.id}-${option.value}` },
        input,
        el('span', { class: 'choice-option-text' }, option.label),
      ),
    )
  }

  return {
    el: el(
      'fieldset',
      { class: 'choice predict', 'data-predict': config.id },
      el('legend', { class: 'choice-legend' }, config.legend),
      options,
    ),
    verdict: createVerdict(config.verdictId),
    value: () => chosen,
  }
}

/**
 * The grading sentence, assembled from the reader's guess and the MEASURED outcome.
 *
 * Kept in one place so both panels say it the same way, and so the shape is obvious:
 * what you said, what happened, and — when those differ — which is which. The
 * `outcomes` map supplies the plain-language name of each outcome so the sentence
 * can quote the real one even when the reader never guessed it.
 */
export function gradePrediction(args: {
  readonly guess: string | null
  readonly actual: string
  readonly outcomes: Readonly<Record<string, string>>
  readonly run: number
  /** One sentence of why, shown whatever the reader guessed. */
  readonly because: string
}): Parameters<VerdictHandle['set']>[0] {
  const actualText = args.outcomes[args.actual] ?? args.actual
  if (args.guess === null) {
    return {
      tone: 'open',
      run: args.run,
      headline: 'No prediction yet',
      detail: `Pick one of the three above, then run the experiment. ${args.because}`,
    }
  }
  const guessText = args.outcomes[args.guess] ?? args.guess
  if (args.guess === args.actual) {
    return {
      tone: 'pass',
      run: args.run,
      headline: 'That is what happened',
      detail: `You said: ${guessText} And that is what the run did. ${args.because}`,
    }
  }
  return {
    tone: 'trap',
    run: args.run,
    headline: 'Not what happened — and this is the useful part',
    detail:
      `You said: ${guessText} What the run actually did: ${actualText} ${args.because}`,
  }
}
