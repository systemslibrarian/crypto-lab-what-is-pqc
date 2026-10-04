import { formatBytes } from '../exchange/sizes.js'
import type { AgreedSecret } from '../exchange/types.js'
import { clear, el } from './dom.js'
import { renderVerdict } from './verdict.js'

/**
 * ONE renderer for panels 1 and 2.
 *
 * This is the brief's symmetry requirement expressed as code rather than as a
 * CSS convention. Both panels pass an `AgreedSecret` through this function, so
 * neither can acquire a field, a label, a colour or a layout the other does not
 * have. A reader should see two things doing the same job — which is the whole
 * argument against "stronger" — and the cheapest way to guarantee that is to make
 * it impossible to render them differently.
 */
export interface ExchangePanelOptions {
  /** Stable verdict marker id for this panel. */
  readonly verdictId: string
  /** What each party DID, in plain language — the only per-panel wording. */
  readonly leftRole: string
  readonly rightRole: string
  /** A run serial, so a test can tell a re-run from a re-render. */
  readonly run: number
}

export function renderExchange(
  into: HTMLElement,
  view: AgreedSecret,
  options: ExchangePanelOptions,
): void {
  clear(into)

  const parties = el('div', { class: 'parties' })
  for (const [party, role] of [
    [view.left, options.leftRole],
    [view.right, options.rightRole],
  ] as const) {
    parties.append(
      el(
        'div',
        { class: 'party' },
        el('p', { class: 'party-name' }, party.name),
        el('p', { class: 'party-role' }, role),
        el('span', { class: 'party-label' }, 'Secret they now hold'),
        el(
          'p',
          { class: 'party-secret', 'data-secret': party.name.toLowerCase() },
          `${party.secretPrefix}…`,
        ),
      ),
    )
  }

  const wireList = el('ul', { class: 'wire-list', role: 'list' })
  for (const item of view.wire) {
    wireList.append(
      el(
        'li',
        { class: 'wire-item', role: 'listitem' },
        el('span', { class: 'wire-item-label' }, `${item.label}, from ${item.from}`),
        el(
          'span',
          { class: 'wire-item-bytes', 'data-wire-bytes': String(item.bytes) },
          `${formatBytes(item.bytes)} bytes`,
        ),
      ),
    )
  }

  const verdict = renderVerdict(
    view.secretsMatch
      ? {
          id: options.verdictId,
          tone: 'pass',
          headline: 'Same secret on both sides',
          detail:
            `${view.left.name} and ${view.right.name} each hold the same ` +
            `${view.secretBytes} bytes, and neither of them sent it. Compare the two values ` +
            `above: ${view.left.secretPrefix} against ${view.right.secretPrefix}. All ` +
            `${view.secretBytes} bytes were checked, not just the ones shown.`,
        }
      : {
          id: options.verdictId,
          tone: 'alarm',
          headline: 'The two sides do not match',
          detail:
            `${view.left.name} holds ${view.left.secretPrefix} and ${view.right.name} holds ` +
            `${view.right.secretPrefix}. For ${view.scheme} with both sides behaving, this ` +
            'should not happen — something on this page is wrong.',
        },
  )
  verdict.setAttribute('data-run', String(options.run))

  into.append(
    parties,
    el(
      'div',
      { class: 'wire' },
      el('p', { class: 'wire-title' }, 'What crossed the wire, where anyone could read it'),
      wireList,
    ),
    verdict,
  )
}
