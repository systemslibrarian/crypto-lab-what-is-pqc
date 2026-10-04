import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The three widths this gate scans, because WCAG 1.4.10 has more than one
 * failure shape and one width only finds one of them.
 *
 * 1280 is the desktop rendering. 390 is a current phone (iPhone 14/15 class),
 * which is the width a reader most often actually arrives at. 320 is the floor
 * 1.4.10 names explicitly — 320 CSS pixels, equivalent to 1280px at 400% zoom —
 * and it is where this lab's wide things give way first: the two-column
 * `.parties` grid, the label/value pair in every `.size-row`, and the monospace
 * secret prefixes that have no spaces to break at.
 */
export const WIDE = { width: 1280, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const NARROW = { width: 320, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, and each one corrects something the gate
 * this replaces did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important; transition:none!important` through
 *     `addStyleTag`. That BYPASSES this lab's own
 *     `@media (prefers-reduced-motion: reduce)` block instead of exercising it,
 *     so the one rendering a reduced-motion reader actually gets — this lab's
 *     button transitions cancelled by the stylesheet's own rule — was never once
 *     the rendering that got scanned. This gate sets the
 *     preference through `emulateMedia`, asserts from inside the page that it
 *     took effect (`test.use({ reducedMotion })` silently does nothing on
 *     Playwright 1.61.x), and injects nothing.
 *
 *  2. IT FORCED EVERY PANEL VISIBLE FROM SCRIPT. The old drive stripped every
 *     `[hidden]` attribute and set every `<details>.open` by JS before its only
 *     scan — a rendering no reader can reach, which axe then scans instead of
 *     the real one. This lab ships no tabs and no disclosures: all five panels
 *     are on one scrolling page, which is the right shape for a beginner
 *     on-ramp and removes that whole class of defect. What is left to get wrong
 *     is REACHING EACH STATE THE REAL WAY, so this drive presses the real
 *     buttons and the real radios, and it asserts the `[hidden]` cascade probe
 *     anyway: a class rule setting `display` outranks the UA `[hidden]` rule,
 *     so an element can paint while the code believes it is hidden.
 *
 *  3. IT DROVE BLIND AND THEN THREW THE STATES AWAY. The old drive clicked
 *     every button whose label matched a regex, swallowed every failure with
 *     `.catch(() => {})`, waited a fixed 120ms per tab, and scanned ONCE at the
 *     end — so a click that silently did nothing looked identical to one that
 *     worked. This drive names every control it touches, asserts a real
 *     completion signal after each, and scans after every step, at 1280, 390
 *     and 320. Dark is the only theme (template §3.2), so the theme axis the
 *     original had is gone rather than quietly scanning dark twice.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. The surfaces that carry
 *     this lab's meaning are the four `.verdict[data-tone]` states — pass, trap,
 *     alarm, retired — the `.callout` that holds the negative claim, the hero's
 *     accent wash and the shared top bar's `color-mix()` ink. Several of those
 *     are `color-mix()` fills axe files under `incomplete` rather than judging,
 *     and so is an `aria-label` on a role-less element.
 *
 *  5. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. The old
 *     spec hand-rolled one luminance check over two input selectors, reading
 *     the DECLARED `border-top-color` and `background-color` — blind to
 *     `color-mix()`, to composited backdrops, to every `.btn` and radio, and to
 *     all states past first paint. `nontext.ts` replaces it with a measured
 *     oracle over every control at every driven state — including the
 *     `::before` dashes on `.link-list` and `.honesty-list`, which are
 *     generated content no element-level walk can reach — and
 *     `expectNoHorizontalOverflow` adds the 1.4.10 check axe has no rule for.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it: elsewhere in
 * this fleet that produced a phantom 2.00:1 failure on a button whose settled
 * ratio is 9:1. Transitions also drain in waves rather than in one batch, so a
 * poll for "nothing running right now" can exit through a gap between waves —
 * hence six consecutive quiet frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * animations that never finish (`iterations: Infinity`) are excluded from the
 * quiescence test rather than waited on, a wall-clock budget inside the page
 * gives up and proceeds, and Playwright's own timeout is the backstop.
 *
 * Under the reduced motion this gate asserts, `style.css`'s reduced-motion
 * block cancels every transition inside `#app`, so `getAnimations()` is normally
 * empty and this returns on the sixth frame. It stays for two reasons. The
 * shared top bar's `.cl-btn` transitions are declared OUTSIDE that block and
 * outside `#app`, so nothing in this lab's stylesheet cancels them. And this lab
 * has no animation at all today — decorative motion is banned (§2) and nothing
 * here is animated — so this function's value is entirely in the day someone
 * adds one.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab has
 * no keyframes and nothing that reaches its visible state through an animation,
 * so the assertion is expected to be vacuous here. It runs at every scanned
 * state regardless, because that shape is one `@keyframes fade` away and the
 * failure it produces is invisible: the content is in the DOM, the scan passes,
 * and a reader with the preference set sees an empty page.
 *
 * `aria-hidden` subtrees are excluded; what this lab hides is the decorative
 * `.verdict-glyph` and `.callout-icon` beside their own words — see
 * `contrast.ts`, which measures them anyway with the exemption lifted.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. `main.ts` runs both exchanges at mount and renders five panels
 * synchronously, so a renderer that throws leaves its mount point EMPTY — and an
 * empty region is exactly what a scan reports as perfectly accessible. Real
 * cryptography makes this more than theoretical: a library that threw on one
 * input in a thousand would show up here and nowhere else. Attach before `boot`,
 * assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's own
 * hero is a `<div class="cl-hero">`, not a `<header>`, so nothing here implies
 * a second banner today — but template §3.1 prints the hero as a `<header>`,
 * which is exactly the markup this assertion exists to catch, and the shared
 * bar's `dedupeBanner()` exists because other labs in this fleet shipped it.
 * Asserting the OUTCOME rather than the markup is what survives that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab has three lists, and every one of them is styled `list-style: none`
 * — `ul.wire-list` in both exchange panels, `ul.link-list` in the closing panel
 * and `ul.honesty-list`. That declaration is exactly what makes Safari and
 * VoiceOver DROP a list's implicit role, so all three carry an explicit
 * `role="list"` with `role="listitem"` on every child, which is the documented
 * compensation rather than the usual defect. What is asserted
 * is therefore the SHAPE of that fix: any explicit role on a `ul`/`ol` must be
 * `list` (any other value orphans every `<li>` under it), and a `role="list"`
 * must never sit on an empty element, because axe applies
 * `aria-required-children` to the explicit role and fails it the day the
 * pipeline renders with no stages. Roles can be assigned as JS properties in
 * an element-creation helper, so ask the DOM rather than grepping the source.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
      )
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children'
  ).toEqual([]);
}

/**
 * Shared setup. Runs before EVERY test that imports it, so an assertion here
 * fails all of them at once, under whatever name those tests carry.
 *
 * SO THIS FUNCTION ASSERTS STRUCTURE AND NEVER PRODUCT COPY (§4.1a). On
 * 2026-09-26 crypto-lab-mceliece-gate changed one textarea's default string; its
 * gate.ts still asserted the old sentence, `boot()` threw, both axe runs failed,
 * the build job failed, the deploy was skipped, and `deploy-sync` reported the
 * lab stale. The step that went red was called "Accessibility gate", and four of
 * its six a11y tests had passed. For three days the live site served security
 * claims that `main` had already corrected, and the one red thing in sight named
 * the wrong subject.
 *
 * Structure is: the control exists, the arrival state is the one that ships,
 * counts, a default matching a SHAPE. Copy — what a string SAYS — lives in
 * `e2e/claims.spec.ts`, where a failure names copy as the subject. This lab leans
 * on that split harder than most, because its central claim is a piece of
 * WORDING: that nothing on the page calls post-quantum cryptography stronger. That
 * assertion is a claim, it is tested, and it is deliberately not here.
 *
 * The defaults are asserted at length because `main.ts` runs both exchanges at
 * mount. A navigation that resolves proves nothing: a renderer that threw would
 * leave its mount point empty, and an empty region is exactly what a scan reports
 * as perfectly accessible.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.x, so the
 * emulation is applied imperatively BEFORE the navigation and then asserted from
 * inside the page.
 */
export async function boot(page: Page): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 20s turns that silent hang into a
  // named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);

  // Dark is the only theme (§3.2). The literal on <html> plus the head's
  // anti-flash script are the whole mechanism; there is nothing to seed and
  // nothing to toggle.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ──────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly the kind of thing a green axe run says
  // nothing about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page must carry no theme control at all — not
  // the shared bar's, which was removed, and not a lab-local one. The shared CSS
  // hides any lab toggle with `display:none !important`, which would leave a
  // dead-but-known element; asserting the count at zero catches the day one is
  // added without going through that list.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);
  await expect(page.locator('#cl-theme-toggle')).toHaveCount(0);

  // ── Nothing on this page is hidden, and nothing is behind a disclosure ────
  // All five panels are on one scrolling document. Asserting both at zero is what
  // makes the drive's coverage claim checkable: there is no state a reader can
  // reach that the drive has to remember to open.
  await expect(page.locator('#app [hidden]')).toHaveCount(0);
  await expect(page.locator('#app details')).toHaveCount(0);

  // ── Every panel rendered, and none of them is empty ───────────────────────
  for (const id of [
    'classical-body',
    'pq-body',
    'sizes-body',
    'break-body',
    'owner-body',
  ]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`#${id}`)).not.toBeEmpty();
  }

  // ── Exactly one of each verdict marker, at first paint ────────────────────
  // Five markers, each rendered once. `e2e/verdict-coverage.spec.ts` checks the
  // other direction — that every marker on screen has a recorded mutation behind
  // it — and `e2e/verdict-mutations.json` names each one as a thing a mutation
  // has to turn red.
  for (const marker of ['classical-agreed', 'pq-agreed', 'size-change', 'byte-flip', 'key-owner']) {
    await expect(page.locator(`[data-verdict="${marker}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-verdict]')).toHaveCount(5);

  // Every verdict carries a tone and a run serial. The tone is what the colour,
  // the glyph and the wording all derive from; the serial is how a test tells a
  // real re-run from a re-render (§4.1b's no-op guard).
  for (const verdict of await page.locator('[data-verdict]').all()) {
    await expect(verdict).toHaveAttribute('data-tone', /^(pass|trap|alarm|retired)$/);
    await expect(verdict).toHaveAttribute('data-run', /^[1-9][0-9]*$/);
  }

  // ── The shipped shape of each exchange panel ──────────────────────────────
  // Two parties and two wire items each, and the two panels must agree on both
  // counts: they are rendered by ONE function on purpose (the brief's symmetry
  // requirement), and a count that diverged would mean that stopped being true.
  for (const panel of ['#panel-classical', '#panel-pq']) {
    await expect(page.locator(`${panel} .party`)).toHaveCount(2);
    await expect(page.locator(`${panel} .wire-item`)).toHaveCount(2);
    // A SHAPE, not a value: 16 hex characters and an ellipsis. What the bytes
    // ARE changes every run, which is the point of running real cryptography.
    for (const secret of await page.locator(`${panel} [data-secret]`).all()) {
      await expect(secret).toHaveText(/^[0-9a-f]{16}…$/);
    }
  }

  // ── The size comparison ───────────────────────────────────────────────────
  // Four rows: two wire items per panel. The agreed secret is NOT among them — it
  // never crossed the wire, so it lives in its own "never sent" block and is kept
  // out of both the rows and the bars.
  await expect(page.locator('#panel-sizes .size-row')).toHaveCount(4);
  await expect(page.locator('#panel-sizes [data-total="classical"]')).toHaveCount(1);
  await expect(page.locator('#panel-sizes [data-total="pq"]')).toHaveCount(1);
  await expect(page.locator('#panel-sizes [data-size="agreed-secret"]')).toHaveCount(1);
  // Two bars, each with a measured width. That they are to SCALE is a claim and is
  // asserted in claims.spec.ts; that there are exactly two is structure.
  await expect(page.locator('#panel-sizes .size-bar-fill')).toHaveCount(2);

  // ── Panel 3 compares both sides rather than describing them ───────────────
  await expect(page.locator('#panel-break [data-held]')).toHaveCount(2);
  await expect(page.locator('#panel-break [data-fact="match"]')).toHaveCount(1);
  await expect(page.locator('#panel-break [data-fact="error"]')).toHaveCount(1);

  // ── Panel 4 draws its participants ────────────────────────────────────────
  // Two in the honest arrival state: Dev and the key's owner. The third card, the
  // person Dev believes they are talking to, appears only in the impostor state.
  await expect(page.locator('#panel-owner .who-card')).toHaveCount(2);

  // ── Controls ──────────────────────────────────────────────────────────────
  for (const id of ['classical-run', 'pq-run', 'break-toggle']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  // Panel 3 ships ONE button that toggles, not two that replace each other. The
  // mode it offers is structural — it decides what the arrival state scans — while
  // its label is copy and belongs to claims.spec.ts.
  await expect(page.locator('#break-toggle')).toHaveAttribute('data-mode', 'break');

  // Panel 4's owner choice: two radios in a real fieldset, exactly one checked,
  // and the honest option is the one that ships. WHICH option is pressed is
  // structural — it decides what the arrival state scans — while what the options
  // SAY is copy and belongs to claims.spec.ts.
  await expect(page.locator('#panel-owner fieldset')).toHaveCount(1);
  await expect(page.locator('#panel-owner legend')).toHaveCount(1);
  await expect(page.locator('#panel-owner input[name="key-owner"]')).toHaveCount(2);
  await expect(page.locator('#panel-owner input[name="key-owner"]:checked')).toHaveCount(1);
  await expect(page.locator('#key-owner-rae')).toBeChecked();

  // The negative claim's limitation block exists and is NOT behind anything
  // (§4.1d assertion 3 asserts its text; this asserts it is reachable at all).
  await expect(page.locator('[data-limitation="authentication"]')).toHaveCount(1);

  await settle(page);
  await expectNotBlank(page, 'first paint');
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all. The shapes at risk
 * here are the monospace runs — `.party-secret` prints a 16-character hex prefix
 * and the verdict details quote two more — all of which rely on
 * `overflow-wrap: anywhere` rather than a scroll region. Add to that two
 * `auto-fit` / two-column grids, `.parties` and `.size-row`, whose automatic
 * minimum size is the min-content of their widest unbreakable child. At 320px,
 * the width WCAG names, that is precisely what this check exists to catch.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This lab avoids scrollers on purpose — its hex wraps via
 * `overflow-wrap: anywhere` and it ships no table — so the assertion is vacuous
 * here today. It runs at every state anyway, because the requirement
 * MATERIALISES the moment someone reaches for `overflow-x: auto` to stop a wide
 * value reflowing, which is the first thing anyone tries when the 320px check
 * above goes red. A scroller born without a keyboard route is invisible to axe.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen
 * and the focus ring lands nowhere. `display: none` and `visibility: hidden`
 * DO remove an element from the tab order, so those are skipped rather than
 * flagged — the failure is specifically the invisible-but-tabbable pair. Nothing
 * on this page is hidden: all five panels are on one scrolling document and
 * every control in them is in the tab order at all times, so a focusable element
 * that paints nothing here would be a straightforward defect rather than a
 * disclosure state.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with
 * full opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI, and a run
 * with it set prints every finding as it happens and then fails at the end, so
 * a green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    // Generous, not 900: a truncated oracle dump is how a second and third
    // finding in the same state get missed on a collection pass.
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Fleet-wide
 * this oracle had been called from inside a soft wrapper AFTER its
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard returned first and
 * `nontext.ts` never executed at all. Thirteen repos certified themselves
 * clean on an oracle that had never looked. Calling it here means it runs at
 * every driven state, including `:hover`, and this repo's baseline was
 * captured by that live path.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything
 * in the baseline that has been FIXED fails until its entry is deleted. That
 * last rule is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the
 * point — or the drive stopped reaching the state that shows it, which is a
 * coverage regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically — which matters here because the hero aside, the
 *    `.btn:hover` fill and the shared bar's ink are all `color-mix()` fills axe
 *    cannot resolve. Everything else in that bucket is a real result axe simply
 *    could not finish — including `aria-prohibited-attr`, which is where an
 *    `aria-label` on a role-less element hides. This page's one grouped control
 *    is panel 4's owner choice, and it uses a real `<fieldset>`/`<legend>`
 *    rather than a labelled `role="group"`, which is the shape that cannot be
 *    silently discarded.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted —
 *    SC 1.4.3 is about what a reader SEES, and this lab hides two glyphs that
 *    are very much seen: `.verdict-glyph` and `.callout-icon`. They are
 *    `aria-hidden` because the word beside each says the same thing, which is
 *    correct for a screen reader and says nothing about contrast.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a
 *    control's boundary against the surface OUTSIDE it.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding an `<aside class="cl-hero-why">`, two `<nav>`s
  // (the shared actions and the tablist wrapper), one `<main>` and a footer.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr`
  // and `aria-required-children` appear ONLY here — never in `violations` — so
  // a gate that ignores this bucket cannot see either. Only `color-contrast`
  // is allowed to remain, and only because the arithmetic walk below judges
  // those ratios for real; no other rule is filtered out.
  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the
  // ONLY thing that ever measures it. See `contrast.ts` for the inventory.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/**
 * Drive the lab through every state it can render, scanning each.
 *
 * Four things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: both
 *    exchanges already run, the size comparison derived from them, panel 3
 *    untouched and panel 4 on the honest option.
 *
 *  - EVERY STATE OF EVERY VERDICT MARKER. `byte-flip` has three (untouched,
 *    broken, retired) and `key-owner` has two (honest, impostor). All five are
 *    scanned, which matters because the trap and alarm tones exist nowhere else
 *    on the page: scan only the arrival state and three of this lab's four
 *    verdict tones are never measured at all.
 *
 *  - HOVER IS A STATE, AND IT PERSISTS AFTER A CLICK. `:hover` stays on the
 *    element under the pointer after `page.click()` resolves, so it is the state
 *    a reader occupies the instant after pressing a button — and `.btn:hover`
 *    repaints its fill with a `color-mix()` axe will not resolve. It is scanned
 *    explicitly rather than incidentally.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM completion signal: a
 *    verdict's tone attribute, a run serial incrementing, a radio's checked
 *    state. A `waitForTimeout` here is the scan race that lets axe measure an
 *    empty container and report it perfect.
 */
export async function driveAllStates(page: Page, label: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${label} / ${s}`);
  const verdict = (marker: string): Locator => page.locator(`[data-verdict="${marker}"]`);

  await scanAt('arrival: both exchanges run, panel 3 untouched, panel 4 honest');

  // ── The shared skip link, focused ─────────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── Panel 1 re-run. Also the no-op guard: this must NOT retire panel 3 ────
  await page.locator('#classical-run').click();
  await expect(verdict('classical-agreed')).toHaveAttribute('data-run', '2');
  await expect(verdict('byte-flip')).toHaveAttribute('data-tone', 'pass');
  await scanAt('panel 1 re-run with fresh values, still hovered');

  // ── Panel 2 re-run ────────────────────────────────────────────────────────
  await page.locator('#pq-run').click();
  await expect(verdict('pq-agreed')).toHaveAttribute('data-run', '2');
  await scanAt('panel 2 re-run with a fresh key pair, still hovered');

  // ── Panel 3: the broken state, which is the only `trap` tone on the page ──
  // Driven from the KEYBOARD, not by a click, because this panel's defect was a
  // keyboard defect: the button used to be replaced on activation and focus landed
  // on <body>. Pressing Enter and then asserting focus is still on the control is
  // the only thing that would have caught it, and axe has no rule for it.
  await page.locator('#break-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(verdict('byte-flip')).toHaveAttribute('data-tone', 'trap');
  await expect(page.locator('#break-toggle')).toBeFocused();
  await expect(page.locator('#break-toggle')).toHaveAttribute('data-mode', 'restore');
  await scanAt('panel 3: one ciphertext byte changed, by keyboard, control still focused');

  await page.keyboard.press('Enter');
  await expect(verdict('byte-flip')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#break-toggle')).toBeFocused();
  await scanAt('panel 3: the byte put back, untouched again, control still focused');

  // ── Panel 3 retired: a result about a sealed box that no longer exists ────
  await page.locator('#break-toggle').click();
  await expect(verdict('byte-flip')).toHaveAttribute('data-tone', 'trap');
  await page.locator('#pq-run').click();
  await expect(verdict('byte-flip')).toHaveAttribute('data-tone', 'retired');
  await scanAt('panel 3: retired after panel 2 ran again');

  // ── Panel 4: the impostor fixture — the page's only `alarm` tone ──────────
  await page.locator('#key-owner-impostor').check();
  await expect(verdict('key-owner')).toHaveAttribute('data-tone', 'alarm');
  await expect(verdict('key-owner')).toHaveAttribute('data-owner', 'mal');
  // The third participant card appears here and nowhere else: the person Dev
  // believes they are talking to, holding nothing.
  await expect(page.locator('#panel-owner .who-card')).toHaveCount(3);
  await expect(page.locator('#panel-owner .who-absent')).toHaveCount(1);
  await scanAt('panel 4: the impostor fixture — every check green, the owner unproven');

  // The radio keeps focus because this panel no longer rebuilds its own controls.
  // That focus ring is painted on a control inside an `alarm`-toned region and is
  // scanned nowhere else.
  await expect(page.locator('#key-owner-impostor')).toBeFocused();
  await scanAt('panel 4: the impostor radio focused inside the alarm region');

  await page.locator('#key-owner-rae').check();
  await expect(verdict('key-owner')).toHaveAttribute('data-tone', 'pass');
  await expect(verdict('key-owner')).toHaveAttribute('data-owner', 'rae');
  await scanAt('panel 4: back to the honest key');

  // ── Hover, which persists after a click ───────────────────────────────────
  await page.locator('#break-toggle').hover();
  await scanAt('a primary button hovered — its color-mix fill repainted');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings on the other two kinds of control ─────────────────────────
  await page.locator('#pq-run').focus();
  await expect(page.locator('#pq-run')).toBeFocused();
  await scanAt('a button focused, showing its focus-visible outline');

  await page.locator('#panel-story .link-list a').first().focus();
  await scanAt('an outbound link focused in the closing panel');
}
