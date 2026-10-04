import { compareSizes, formatBytes, type SizeComparison } from '../exchange/sizes.js'
import type { AgreedSecret } from '../exchange/types.js'
import { clear, el } from './dom.js'
import { renderVerdict } from './verdict.js'

/**
 * The one measurable difference between panels 1 and 2, stated as arithmetic.
 *
 * Every number rendered here was measured from the byte arrays the two panels
 * actually produced. The row labels name the real objects in plain language
 * ("the sealed box", not "the ciphertext c"), and the totals are printed beside
 * the quotient so a reader can do the division themselves — which is the point of
 * choosing size as the comparison in the first place.
 */
export function renderSizes(
  into: HTMLElement,
  classical: AgreedSecret,
  pq: AgreedSecret,
  run: number,
): SizeComparison {
  const c = compareSizes(classical, pq)
  clear(into)

  const rows = el('div', { class: 'size-rows' })
  const row = (label: string, bytes: number, key: string): HTMLElement =>
    el(
      'div',
      { class: 'size-row' },
      el('span', { class: 'size-row-label' }, label),
      el('span', { class: 'size-row-value', 'data-size': key }, `${formatBytes(bytes)} bytes`),
    )

  for (const item of classical.wire) {
    rows.append(row(`Panel 1 — ${item.label.toLowerCase()}`, item.bytes, `classical-${item.from}`))
  }
  for (const item of pq.wire) {
    rows.append(row(`Panel 2 — ${item.label.toLowerCase()}`, item.bytes, `pq-${item.from}`))
  }
  rows.append(
    row('Panel 1 — the secret both sides ended up with', classical.secretBytes, 'classical-secret'),
    row('Panel 2 — the secret both sides ended up with', pq.secretBytes, 'pq-secret'),
  )

  const sum = el(
    'p',
    { class: 'size-sum' },
    el('span', { 'data-total': 'classical' }, `${formatBytes(c.classicalWireBytes)} bytes`),
    ' on the wire in panel 1, ',
    el('span', { 'data-total': 'pq' }, `${formatBytes(c.pqWireBytes)} bytes`),
    ' in panel 2.',
  )

  const verdict = renderVerdict(
    c.bothExchangesAgreed
      ? {
          id: 'size-change',
          tone: 'pass',
          headline: `Bigger by ${c.timesLarger} times — and that is the difference`,
          detail:
            `${formatBytes(c.pqWireBytes)} divided by ${formatBytes(c.classicalWireBytes)} is ` +
            `${c.timesLarger}. The secret stayed ${c.secretBytes} bytes in both panels, both ` +
            'sides matched in both panels, and the job both panels did is the same job. The ' +
            'bytes grew and the hard problem underneath changed. Nothing else did.',
        }
      : {
          id: 'size-change',
          tone: 'alarm',
          headline: 'One of the two exchanges did not agree',
          detail:
            'Comparing their sizes would mean nothing while one of them is failing. Re-run the ' +
            'panel above that is reporting a mismatch.',
        },
  )
  verdict.setAttribute('data-run', String(run))

  into.append(rows, sum, verdict)
  return c
}
