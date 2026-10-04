/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * A run with `NT_BASELINE_CAPTURE=1` set prints every finding through this same
 * path and asserts nothing, which is how this file is regenerated.
 *
 * IT IS EMPTY, AND THAT IS A MEASUREMENT RATHER THAN AN UNRUN CHECK. A capture
 * run over all three viewports and all fourteen driven states printed ZERO
 * findings, which was then checked by degrading the token the oracle owns:
 * `--border-strong` moved from `#567183` to `#16222a`, the build still succeeded,
 * and the gate failed naming all three `.btn` instances at 1.1:1 against their
 * surround. So this file's emptiness is the terminal state of the ratchet.
 *
 * Two things earn it. Every control on this page draws its edge from
 * `--border-strong` over `--surface-2` rather than repainting its border the same
 * colour as its own fill — which is the shape that made `.btn-primary` and the
 * selected `.seg-btn` fail at 2.39:1 in the lab this gate was copied from. And
 * the shared top bar's `.cl-btn` mixes its edge toward `--cl-ink` instead of
 * toward `--accent`, so the two entries most of this fleet carries are absent
 * here too — which matters more than usual, because this lab's `--accent` is a
 * central assignment that has not been made yet and nothing measured above
 * depends on what it turns out to be.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
