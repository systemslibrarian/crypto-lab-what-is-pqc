import './style.css'

import { runPqExchange, viewPq, type PqExchange } from './exchange/mlkem.js'
import type { AgreedSecret } from './exchange/types.js'
import { runClassicalExchange, viewClassical } from './exchange/x25519.js'
import { createBreakPanel } from './ui/breakPanel.js'
import { renderExchange } from './ui/exchangePanel.js'
import { mount } from './ui/dom.js'
import { createOwnerPanel } from './ui/ownerPanel.js'
import { renderSizes } from './ui/sizesPanel.js'

/**
 * Wiring only. Every computation lives in src/exchange/ and every rendering
 * decision in src/ui/.
 *
 * BOTH EXCHANGES RUN AT MOUNT, so first paint carries real verdicts rather than
 * placeholders. That is a teaching choice before it is a testing one — a beginner
 * arriving at this page should see the thing already working, not a page of empty
 * boxes and a button. It also means an accessibility scan of the arrival state is
 * scanning something: an empty region is exactly what a scan calls perfect.
 */

const classicalBody = mount('classical-body')
const pqBody = mount('pq-body')
const sizesBody = mount('sizes-body')
const breakBody = mount('break-body')
const ownerBody = mount('owner-body')

interface State {
  classical: AgreedSecret
  pq: AgreedSecret
  pqExchange: PqExchange
  classicalRun: number
  pqRun: number
}

function classicalStep(run: number): AgreedSecret {
  const view = viewClassical(runClassicalExchange())
  renderExchange(classicalBody, view, {
    verdictId: 'classical-agreed',
    leftRole: 'Sends one public value, keeps one private.',
    rightRole: 'Sends one public value, keeps one private.',
    run,
  })
  return view
}

function pqStep(run: number): { exchange: PqExchange; view: AgreedSecret } {
  const exchange = runPqExchange()
  const view = viewPq(exchange)
  renderExchange(pqBody, view, {
    verdictId: 'pq-agreed',
    leftRole: 'Publishes a key, keeps the one that opens it.',
    rightRole: 'Seals a box to that key, keeping what sealing produced.',
    run,
  })
  return { exchange, view }
}

function renderComparison(state: State): void {
  // The comparison's run serial is the pair of runs behind it, so a test can see
  // that re-running either panel re-derived the sizes rather than leaving a stale
  // quotient on screen beside two fresh exchanges.
  renderSizes(sizesBody, state.classical, state.pq, state.classicalRun + state.pqRun)
}

const firstPq = pqStep(1)
const state: State = {
  classical: classicalStep(1),
  pq: firstPq.view,
  pqExchange: firstPq.exchange,
  classicalRun: 1,
  pqRun: 1,
}
renderComparison(state)

const breakPanel = createBreakPanel(breakBody, state.pqExchange, state.pqRun)
createOwnerPanel(ownerBody)

mount('classical-run').addEventListener('click', () => {
  state.classicalRun += 1
  state.classical = classicalStep(state.classicalRun)
  renderComparison(state)
  // Deliberately does NOT touch panel 3: panel 3 is about panel 2's sealed box,
  // and retiring it here would retire a fresh verdict for an unrelated action.
})

mount('pq-run').addEventListener('click', () => {
  state.pqRun += 1
  const next = pqStep(state.pqRun)
  state.pqExchange = next.exchange
  state.pq = next.view
  renderComparison(state)
  breakPanel.reset(state.pqExchange, state.pqRun)
})
