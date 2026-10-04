# What Is PQC

**[Live demo](https://systemslibrarian.github.io/crypto-lab-what-is-pqc/)** · the Crypto Lab
suite's way in to post-quantum cryptography, for someone who has never met any.

## What It Is

A browser demo that runs the same job twice: **X25519** (RFC 7748) and **ML-KEM-768**
(FIPS 203), side by side, in symmetrical panels, so the only difference a reader can see is
the one that is actually there.

The point it exists to make is a correction. **Post-quantum cryptography is not stronger
cryptography.** It is not a bigger lock. It rests on a *different hard problem*, because the
problem today's keys use has a known quantum solution. That distinction is the single most
common thing people get wrong about the subject, and getting it wrong leads to migrating the
wrong things, in the wrong order, at the wrong time. So this lab never says "stronger" — and
a test asserts that no sentence on the page does, including the sentences it generates at
runtime.

Both primitives are real, from published implementations of published standards:
[`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum)'s ML-KEM-768 and
[`@noble/curves`](https://github.com/paulmillr/noble-curves)' X25519. Nothing is simulated,
approximated or drawn to look right.

**The maths is hidden, not faked.** The words *lattice*, *LWE*, *polynomial*, *ring* and *NTT*
appear nowhere on the page except one sentence pointing at
[Lattice Gentle](https://systemslibrarian.github.io/crypto-lab-lattice-gentle/), which is the
lab that builds that picture up by hand. There is no byte-level panel, no decomposition of the
ciphertext, no parameter table. What is shown instead is **size**, because it is the one thing a
beginner can check with arithmetic alone and because it is the real engineering consequence of
the change.

**Security model.** Everything runs in the browser; there is no backend. Every key is generated
per interaction, lives in memory, and is gone when the tab closes. **Not production crypto — a
teaching demo.** The page says so on the page, not only here.

**Reading load.** The long-form half of each panel sits behind a `<details>` summary, so arrival is
about 1,850 words rather than the 2,300 the full text comes to. Four things may never move behind a
summary and a claims test enforces it: the "not a stronger lock" rule, the teaching-demo line, the
scope of the quantum claim, and the negative claim in exhibit 5. Progressive disclosure must not
hide the qualifications that make an exhibit truthful.

## Exhibits

1. **Two people agree on a secret, in the open** — a real X25519 exchange. Rae and Dev each
   publish one value and each combine it with something they never sent; both end up holding the
   same 32 bytes. Then the sentence that does the work: a machine that does not exist yet is
   expected to be able to take what crossed the wire and work out the secret anyway. No Shor, no
   period finding, no factoring — the link to
   [Shor](https://systemslibrarian.github.io/crypto-lab-shor/) is there for a reader who wants
   the mechanism.

2. **The same thing, on a different hard problem** — a real ML-KEM-768 encapsulation and
   decapsulation. Rae publishes a key, Dev seals a box to it, Rae opens the box, both sides
   match. Same layout, same labels, same colours as exhibit 1, rendered by the same function, so
   a reader sees two things doing the same job.

3. **What actually changed** — the comparison, as arithmetic and as two bars drawn to scale.
   1,184 bytes and 1,088 bytes against 32 and 32: **2,272 bytes of key-agreement messages instead
   of 64, which is 35.5 times bigger**. Scoped to those messages and to nothing else — not a whole
   connection's traffic, and not its speed. The 32-byte agreed secret is kept out of the bars and
   the rows, in its own "never sent" block, because counting it as traffic would be wrong. Neither
   bar is accented: size is a bandwidth trade-off, not a security meter. Every number is measured
   from the byte arrays the two panels actually produced, never typed in, and a claims test reads
   the painted bar widths back to check the picture agrees with the arithmetic.

4. **Break one byte** — flip one bit of the sealed box and let Rae open it anyway. Both secrets
   are printed side by side, and two questions are answered **separately**: do they match (no),
   and did ML-KEM report an error (no). Keeping those apart is the point — collapsing them is how
   a reader concludes that ML-KEM detected the tampering. FIPS 203 specifies that behaviour rather
   than an error. A real protocol does catch it, one layer up, through key confirmation or an
   authentication tag — not by sending the secrets to each other to compare. Rendered as a
   *difference, not an error*, because nothing crashed and that is exactly the trap.
   [KEM Trap](https://systemslibrarian.github.io/crypto-lab-kem-trap/) is the depth treatment.

5. **Who sent that key?** — the same flawless exchange, with a choice of who handed Dev the
   public key. Pick the impostor and every check on the page still reports success: the exchange
   completes, both sides match, the sizes are the published sizes. Three participants are drawn —
   Dev, the key's actual owner holding the same bytes, and Rae holding nothing. The verdict reads
   **"Same secret on both sides — and Rae is not one of them."** There is no failure code for
   this, because ML-KEM was never asked whose key it was. And it is not a post-quantum
   shortcoming: an unauthenticated X25519 exchange, exactly as shown in exhibit 1, has the same
   hole for the same reason, which the panel says so a reader does not trade one misunderstanding
   for another.

6. **Recorded today, read later** — the harvest-now case in plain story form, with links out to
   [Harvest Timeline](https://systemslibrarian.github.io/crypto-lab-harvest-timeline/),
   [Harvest Vault](https://systemslibrarian.github.io/crypto-lab-harvest-vault/) and
   [PQ Chooser](https://systemslibrarian.github.io/crypto-lab-pq-chooser/).

## When to Use It

- **Use it** as someone's first contact with post-quantum cryptography — a class, an onboarding
  session, a link in a thread where someone has just called PQC "stronger encryption".
- **Use it** to settle the size question concretely. "The handshake got 35 times bigger" is a
  sentence people argue about; this page is 2,272 against 64 with the arithmetic beside it.
- **Do NOT use it** to decide what to migrate. It deliberately holds no inventory, no timeline
  and no recommendation; [PQ Chooser](https://systemslibrarian.github.io/crypto-lab-pq-chooser/)
  and [Harvest Timeline](https://systemslibrarian.github.io/crypto-lab-harvest-timeline/) are
  those labs.
- **Do NOT use it** as a source for how ML-KEM works. It is the door, not the building. That is
  [Lattice Gentle](https://systemslibrarian.github.io/crypto-lab-lattice-gentle/) and
  [Kyber Vault](https://systemslibrarian.github.io/crypto-lab-kyber-vault/).
- **Do NOT lift its code into anything.** No key here is stored, rotated, authenticated or
  bound to an identity, and exhibit 5 exists to show why that last one matters.

## Live Demo

**<https://systemslibrarian.github.io/crypto-lab-what-is-pqc/>**

You can run both exchanges as many times as you like with fresh keys, change a byte of the
ciphertext and put it back, and switch who handed over the public key. Nothing is pre-recorded;
every value on screen was computed in your tab when you looked at it.

## What Can Go Wrong

Three real failure modes, two of them visible on the page.

- **A corrupted ciphertext does not raise an error.** FIPS 203's decapsulation uses the
  Fujisaki-Okamoto transform's *implicit rejection*: a ciphertext that does not re-encrypt to
  itself yields a secret derived from a per-key rejection value. The caller gets 32 perfectly
  well-formed bytes that are simply not the other side's 32 bytes. Software that treats "no
  exception" as "the exchange worked" is silently broken. **Exhibit 4.** NIST's own published
  vectors say so too: five of the ten ML-KEM-768 decapsulation test cases are marked
  `"modified ciphertext"` and every one of them has an expected shared secret rather than an
  expected failure.

- **A KEM proves nothing about who is on the other end.** Running ML-KEM establishes a shared
  secret with *whoever owns the key you were given*. Authentication is a separate problem solved
  by a separate primitive — something signs the key, or a transcript binds it to an identity.
  **Exhibit 5**, where every check passes and the peer is still unproven. A reader who leaves
  thinking "post-quantum" means "safe" has been taught wrongly.

- **The sizes break things that are not cryptography.** 1,184-byte keys and 1,088-byte
  ciphertexts do not fit where 32-byte ones did: single-packet handshakes, fixed-width database
  columns, QR codes, embedded buffers. That is why hybrid deployments and negotiation-stripping
  attacks are subjects at all. See
  [Downgrade Wire](https://systemslibrarian.github.io/crypto-lab-downgrade-wire/) and
  [Hybrid Wire](https://systemslibrarian.github.io/crypto-lab-hybrid-wire/).

## Real-World Usage

ML-KEM is the NIST-standardised key encapsulation mechanism, published as **FIPS 203** in
August 2024 and derived from CRYSTALS-Kyber. ML-KEM-768 is the parameter set most deployments
have picked. It is already carrying live traffic: hybrid X25519+ML-KEM-768 key agreement is
deployed in TLS 1.3 by major browsers and CDNs, in SSH, and in Signal's PQXDH. Hybrid, not
replacement — both exchanges run and their secrets are combined — precisely because ML-KEM is
newer and the argument for it is "a different hard problem", not "a stronger lock".

X25519 (RFC 7748) remains everywhere and is not broken today. What it has is a known quantum
solution, and traffic recorded today outlives the key that protected it.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-what-is-pqc.git
cd crypto-lab-what-is-pqc
npm install
npm run dev
```

Then the full gate, which is what CI runs:

```bash
npm test             # 49 unit and known-answer tests
npm run build        # tsc --noEmit, then the production bundle
npm run test:a11y    # axe WCAG 2.1 A/AA at 1280 / 390 / 320 px
npm run test:claims  # what the page says and concludes, plus verdict coverage
npm run test:mutation  # applies each recorded mutation and judges the kill
```

`npm run test:mutation` needs a clean working tree: it archives `HEAD` into a temporary
directory so a crash cannot strand an inverted condition in a file that also holds real work.

## Related Demos

| Lab | Why from here |
|---|---|
| [Shor](https://systemslibrarian.github.io/crypto-lab-shor/) | why the classical problem falls |
| [Lattice Gentle](https://systemslibrarian.github.io/crypto-lab-lattice-gentle/) | the picture underneath, built by hand |
| [KEM Trap](https://systemslibrarian.github.io/crypto-lab-kem-trap/) | the silent decapsulation failure, in depth |
| [Harvest Timeline](https://systemslibrarian.github.io/crypto-lab-harvest-timeline/) | how long you have, as arithmetic |
| [Harvest Vault](https://systemslibrarian.github.io/crypto-lab-harvest-vault/) | recorded now, read later, end to end |
| [PQ Chooser](https://systemslibrarian.github.io/crypto-lab-pq-chooser/) | when you have to pick something |
| [Kyber Vault](https://systemslibrarian.github.io/crypto-lab-kyber-vault/) | this same primitive, taken apart |
| [Downgrade Wire](https://systemslibrarian.github.io/crypto-lab-downgrade-wire/) | what the larger handshake made possible |

## Build & Verify

**49 unit tests** across five files, and **34 browser tests** across three Playwright projects.

**Known-answer tests, with their provenance kept separate** — because "pinned from the
specification" and "reproduced from a validated implementation" are not the same evidence, and
`test/fixtures/PROVENANCE.md` says which is which:

| Primitive | Vectors | Where from |
|---|---|---|
| ML-KEM-768 | 3 keyGen, 3 encapsulation, 10 decapsulation | NIST's published **ACVP** vector sets, pinned to upstream commit `975de31e`, copied byte-for-byte. FIPS 203 itself contains no vectors. |
| X25519 | 2 scalar-multiplication, 1 worked exchange | **RFC 7748** §5.2 and §6.1 — the RFC's own printed bytes. |

The decapsulation group is taken whole because five of its ten cases carry
`"reason": "modified ciphertext"`, and NIST's published answer for each is a specific different
shared secret rather than an error. That is exhibit 4's claim, checked against the publication
rather than against this lab's own behaviour.

**The accessibility gate** (`e2e/a11y.spec.ts`) drives the lab through twenty-four states and runs
nine oracles at each, at three viewport widths — 1280, 390, and 320, the width WCAG 1.4.10 names.
Each of the eight disclosures is opened through its own `<summary>`, scanned, and shut again, then
all eight are scanned open at once; the shut state is scanned too, because it is the one every
reader arrives at. Panel 3 is driven from the keyboard rather than by clicking, because its one
defect was a keyboard defect that clicking could not see.
Beyond axe's WCAG A/AA rules it asserts axe's `incomplete` bucket, computes text contrast
arithmetically (including inside `aria-hidden` subtrees, which both axe and the default walk
skip), measures non-text contrast and generated content against a ratcheted baseline, and checks
reflow, scroller keyboard reachability and invisible focus targets. `e2e/nontext-baseline.ts` is
**empty**, and that is a measured terminal state rather than an unrun check — see its header for
how it was proved.

**The claims suite** (`e2e/claims.spec.ts`) checks that the page tells the truth: each verdict
cross-checked against the values printed beside it, the growth factor re-derived by division from
the two totals on screen, the four wire rows summed to those totals, retirement and no-op
behaviour, the §4.1d negative claim with its evidence fixture, and the brief's two hard rules —
that no sentence calls PQC stronger, and that the hidden maths words appear only in the one
sentence pointing at Lattice Gentle.

**Mutation discipline** (`scripts/mutate.mjs`, `e2e/verdict-mutations.json`). Eight recorded
mutations cover all five verdict markers. Each is a concrete patch — file, an anchor that must
occur exactly once, and its replacement — never a sentence describing an edit. The runner
applies each in an isolated `git archive HEAD` tree and enforces four rules before calling
anything a kill: the owning test passed unmutated in the same run; the patch actually changed
the file and round-trips; the run served the mutated code (the bundle hash moved, and the
failure does not match a shape meaning the code never ran); and the failure is that marker's own
named assertion. **Every `observed` record in the ledger is written by the run that produced
it**, carrying the three bundle hashes and the sha the tree was archived from. Nothing in it is
typed by hand.

Enforcement does not rest on those records: `e2e/global-teardown.ts` fails any run in which a
recorded kill's assertion did not actually execute, read from what the helpers ran rather than
from the spec's source text — because a mention is not an assertion.

## Central assignments pending

Two values belong to the catalog, not to this repository, and are deliberately not chosen here:

- **`--accent`** — `src/style.css` holds the fleet's documented fallback (`#35d6bb`, the value
  `.cl-topbar` uses when `--accent` is undefined) behind a comment saying so. Applying the
  assigned accent is that one line. Nothing the a11y gate measures depends on which hue lands:
  accent is used only for low-percentage washes behind body text and for borders mixed toward an
  ink token, never as a text colour and never as a fill under text. Re-run `npm run test:a11y`
  when it changes anyway.
- **The favicon emoji** — `index.html` carries a comment where the single inline `data:` URI
  goes, in the form template §3.4 requires.

The catalog card's **category** is assigned centrally too, and lives in the catalog repo.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
