import { formatBytes } from '../exchange/sizes.js'
import { clear, el } from './dom.js'

/**
 * Three frames: record it, keep it, read it.
 *
 * WHAT THIS IS, SAID ON THE PAGE AND NOT ONLY HERE: an illustration of a scenario,
 * not a computation running in this tab. Nothing below is being done — no traffic is
 * captured, no machine is simulated, and no date is predicted. The strip carries a
 * label saying so, because a diagram beside four panels of real cryptography will
 * otherwise be read as more of the same, and §2's visual-honesty rule is that an
 * illustrative simplification has to be labelled as one.
 *
 * WHAT IS REAL IN IT. Frame one quotes the measured size of what panel 1 actually
 * put on the wire, so the one number here is the page's own number rather than a
 * figure chosen to look right. When panel 1 re-runs, this re-renders with it.
 *
 * NO ARRIVAL YEAR. The honest statement is "if such a machine is built", and a
 * timeline with a date on it would be inventing the one fact nobody has. Harvest
 * Timeline is the lab that reasons about the timing, and it does it with the
 * reader's own numbers.
 */
export interface HarvestStrip {
  update(classicalWireBytes: number): void
}

export function createHarvestStrip(into: HTMLElement): HarvestStrip {
  return {
    update(classicalWireBytes) {
      clear(into)

      const frame = (
        step: string,
        title: string,
        body: (Node | string)[],
      ): HTMLElement =>
        el(
          'li',
          { class: 'frame', role: 'listitem' },
          el('span', { class: 'frame-step' }, step),
          el('h3', { class: 'frame-title' }, title),
          el('p', { class: 'frame-text' }, ...body),
        )

      into.append(
        el(
          'p',
          { class: 'frame-note', 'data-illustration': 'harvest' },
          el('strong', {}, 'An illustration, not a computation. '),
          'Nothing below is running in this tab: no traffic is being captured, no machine is ' +
            'being simulated, and no arrival date is being predicted. The one measured number is ' +
            "panel 1's, quoted from the exchange above.",
        ),
        el(
          'ol',
          { class: 'frames', role: 'list', 'aria-label': 'Record now, read later, in three steps' },
          frame('Step 1 — today', 'They record all of it', [
            'The ',
            el('span', { 'data-harvest': 'wire' }, `${formatBytes(classicalWireBytes)} bytes`),
            " panel 1 put on the wire, and the encrypted bytes of everything said afterwards. " +
              'Both halves matter: the public values are what a future machine works on, and the ' +
              'encrypted traffic is what there is to read.',
          ]),
          frame('Step 2 — the years in between', 'Nothing happens', [
            'The recording sits on a disk. Not a word of it can be read, and nobody is trying ' +
              'to. Waiting costs almost nothing, which is the part that makes this worth doing ' +
              'at all.',
          ]),
          frame('Step 3 — if such a machine is built', 'They read this afternoon', [
            'It works out that afternoon’s shared secret from the public values on the disk, ' +
              'and that secret decrypts the conversation they already have. Nothing about that ' +
              'afternoon can be changed now: the method that protected it was chosen the day the ' +
              'connection opened.',
          ]),
        ),
      )
    },
  }
}
