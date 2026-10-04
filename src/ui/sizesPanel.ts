import { compareSizes, formatBytes } from '../exchange/sizes.js'
import type { AgreedSecret } from '../exchange/types.js'
import { clear, el } from './dom.js'
import { createVerdict } from './verdict.js'

/**
 * The one measurable difference between panels 1 and 2, stated as arithmetic and
 * drawn as two bars.
 *
 * Every number rendered here was measured from the byte arrays the two panels
 * actually produced. The row labels name the real objects in plain language ("the
 * sealed box", not "the ciphertext c"), and the totals are printed beside the
 * quotient so a reader can do the division themselves — which is the point of
 * choosing size as the comparison in the first place.
 *
 * WHAT THE HEADLINE IS CAREFUL NOT TO SAY, because an earlier version said some of
 * it. "35.5 times bigger" is true of THESE KEY-AGREEMENT MESSAGES and of nothing
 * else: not of a whole TLS handshake, not of a connection's total traffic, and
 * certainly not of its speed. And the panel no longer ends on "nothing else did",
 * which was flatly contradicted by the next panel down — implicit rejection is a
 * behavioural difference between the two methods, and it is the lab's own third
 * lesson.
 *
 * THE BARS ARE TO SCALE OR THEY ARE NOT DRAWN. Their widths are a straight
 * percentage of the larger measured total, so the picture carries the same ratio
 * the arithmetic does. A bar chart that rounded, clamped a minimum width, or used a
 * log axis would be making the smaller number look bigger than it is, in a panel
 * whose entire job is that one proportion. The 32-byte agreed secret is kept OUT of
 * the bars and shown separately: it never crossed the wire, so putting it in a
 * chart of transmitted bytes would be counting it as traffic.
 *
 * Neither bar is accented. Size is a bandwidth trade-off, not a security meter, and
 * a longer bar that read as "more protection" would be the "stronger" claim this
 * lab exists to refuse, smuggled in as a graphic.
 */
export interface SizesPanel {
  update(classical: AgreedSecret, pq: AgreedSecret, run: number): void
}

export function createSizesPanel(into: HTMLElement): SizesPanel {
  const bars = el('div', { class: 'size-bars' })
  const rows = el('div', { class: 'size-rows' })
  const local = el('div', { class: 'size-local' })
  const sum = el('p', { class: 'size-sum' })
  const verdict = createVerdict('size-change')

  into.append(bars, sum, rows, local, verdict.el)

  return {
    update(classical, pq, run) {
      const c = compareSizes(classical, pq)
      const widest = Math.max(c.classicalWireBytes, c.pqWireBytes)

      clear(bars)
      for (const [label, bytes, key] of [
        ['Panel 1 — today', c.classicalWireBytes, 'classical'],
        ['Panel 2 — post-quantum', c.pqWireBytes, 'pq'],
      ] as const) {
        bars.append(
          el(
            'div',
            { class: 'size-bar-row' },
            el('span', { class: 'size-bar-label' }, label),
            el(
              'span',
              { class: 'size-bar-track' },
              // Width as an exact percentage of the larger measured total. The
              // number is also printed, so the bar is a second reading of a value
              // the reader can check rather than the only one.
              el('span', {
                class: 'size-bar-fill',
                style: `width:${((bytes / widest) * 100).toFixed(2)}%`,
                'data-bar': key,
                'data-bar-bytes': String(bytes),
              }),
            ),
            el('span', { class: 'size-bar-value' }, `${formatBytes(bytes)} bytes`),
          ),
        )
      }

      clear(rows)
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

      clear(sum)
      sum.append(
        el('span', { 'data-total': 'classical' }, `${formatBytes(c.classicalWireBytes)} bytes`),
        ' of key-agreement messages in panel 1, ',
        el('span', { 'data-total': 'pq' }, `${formatBytes(c.pqWireBytes)} bytes`),
        ' in panel 2.',
      )

      clear(local)
      local.append(
        el('span', { class: 'size-local-label' }, 'Never sent, and the same in both panels'),
        el(
          'p',
          { class: 'size-local-text' },
          'The agreed secret itself: ',
          el('span', { 'data-size': 'agreed-secret' }, `${formatBytes(c.secretBytes)} bytes`),
          ' in panel 1 and the same in panel 2. It is kept out of the bars above on purpose — it ' +
            'never crossed the wire, so counting it as traffic would be wrong.',
        ),
      )

      verdict.set(
        c.bothExchangesAgreed
          ? {
              tone: 'pass',
              run,
              headline: `The key-agreement messages are ${c.timesLarger} times bigger`,
              detail:
                `${formatBytes(c.pqWireBytes)} divided by ${formatBytes(c.classicalWireBytes)} is ` +
                `${c.timesLarger}. That is a statement about these two exchanges and nothing ` +
                `else: not about a whole connection's traffic, and not about speed. The agreed ` +
                `secret stayed ${c.secretBytes} bytes in both panels and both sides matched in ` +
                'both panels, so the job is the same job on a different hard problem. What the ' +
                'two methods do NOT share is how they behave when something goes wrong, which is ' +
                'the next panel.',
            }
          : {
              tone: 'alarm',
              run,
              headline: 'One of the two exchanges did not agree',
              detail:
                'Comparing their sizes would mean nothing while one of them is failing. Re-run ' +
                'the panel above that is reporting a mismatch.',
            },
      )
    },
  }
}
