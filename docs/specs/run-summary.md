# Run summary (MVP)

## Purpose and scope

A **run summary** is the user-relevant record of **one** barbora-cart-agent run: what happened to each shopping line and whether automation reached **checkout handoff**. It answers “what did the agent do?” and “what do I still need to fix on Barbora?” without turning into diagnostics, telemetry, or payment reporting.

**Payment:** Unchanged from [product requirements](product-requirements.md): the agent **never** automates payment. The summary does **not** include payment status, payment steps, or order completion.

**This document** defines the **logical structure** and **normative rules** for presenting that information. It builds on the conceptual **`RunResultSummary`** and per-line shapes in [data model](data-model.md). It does **not** define database tables, file layouts, or persistence. It does **not** specify a UI or dashboard.

**Wire / output format:** Implementations may emit the summary as console text, HTML, JSON, YAML, or anything else. **No single serialization format is required** by this spec. Tools and humans should be able to rely on the **same fields and semantics** described below, regardless of how they are encoded.

---

## Who consumes it

| Consumer | Typical use |
|----------|-------------|
| **End user** | Understand cart results, spot substitutions and open issues, know whether to continue checkout on Barbora. |
| **Developer / operator** | Debug runs, compare expected vs actual outcomes, support users without reading internal logs. |
| **Future agents / tools** | Parse structured outcomes for retries, diffs, or downstream automation (still **no** payment automation). |

---

## Canonical data shape (reference)

The authoritative field names and meanings live in [data model](data-model.md) §5 **Run result summary**. MVP summaries **must** be expressible in terms of:

**Run-level**

- `runId` (optional)
- `lines` — list of per-line results
- `checkoutHandoffReached`
- `handoffMessage` (optional; especially when handoff was not reached)

**Per line**

- `lineId`
- `outcome` — one of: `added`, `skipped`, `substituted`, `review_needed`
- `userMessage` — short explanation the user can understand
- `barboraLabel` (optional) — product title as on Barbora (often Latvian)
- `quantityAdded` (optional)

Implementations may wrap or render these fields however they choose; the **semantics** stay the same.

---

## Minimum sections (logical)

For **human-oriented** output, the following **logical sections** should appear in a consistent order (exact headings and wording are implementation-defined):

1. **Run header** — Identify the run when `runId` is present; state **`checkoutHandoffReached`** in plain language (e.g. “Checkout handoff: yes/no”).
2. **Needs attention** — All lines with `outcome = review_needed`, surfaced **prominently** (dedicated block, top of the line list, or equivalent). A **count** of review-needed lines in the header is recommended when there is any `review_needed` line.
3. **Line outcomes** — Every input line represented in `lines` with its `outcome` and explanations (see [Per-line representation](#per-line-representation)).
4. **Handoff note** — When `checkoutHandoffReached` is false or the run stopped early, show `handoffMessage` when provided.
5. **Optional cart observations** — Only when reliably observed during the run (see [Optional cart-level information](#optional-cart-level-information)).

**Grouping:** Implementations may group lines by `outcome` (e.g. all `added`, then `substituted`, then `skipped`, then `review_needed`) **as long as** `review_needed` lines remain easy to find (see above).

---

## Per-line representation

Each entry in `lines` should be readable on its own: **which list line** (`lineId`), **what happened** (`outcome`), and **why** (`userMessage`).

| `outcome` | What the summary must convey |
|-----------|------------------------------|
| `added` | The intended line was satisfied and the product was added; use `barboraLabel` and/or `userMessage` so the user recognizes the cart line. Include `quantityAdded` when known. |
| `skipped` | Nothing was added for this line and the user should understand why (e.g. no fit, policy, or executor failure—described in `userMessage` without low-level internals). |
| `substituted` | A **different** product than the preferred/mapped one was added under substitution policy. See [Substitutions](#substitutions) — **mandatory** clarity on what actually went to the cart. |
| `review_needed` | The user must **decide on Barbora** (or fix the list and re-run). `userMessage` should say what is ambiguous or blocked. |

Alignment with resolver behavior (clear / uncertain / no fit, substitution policy) is defined in [Latvian product matching](latvian-product-matching.md); this document only specifies how those outcomes **read** in the summary.

---

## Substitutions

When **`outcome = substituted`**, the summary **must** make it obvious **what product was actually added** to the cart, using **only** existing conceptual fields: at minimum **`barboraLabel` and/or `userMessage`**.

**Normative expectations**

- **`barboraLabel`** should identify the product that was added (as shown on Barbora), when the implementation has that title.
- **`userMessage`** should still read naturally and, for substitutions, should not leave ambiguity about “what is in the cart now” (e.g. mention that a substitute was added and name it if `barboraLabel` is not shown elsewhere in the same line block).

**No new required fields** are introduced by this spec for substitution reporting; do not require extra persisted properties for MVP.

---

## Surfacing `review_needed`

- Every `review_needed` line appears in **`lines`** with `outcome = review_needed`.
- Human-oriented output **must** use the **Needs attention** prominence rule under [Minimum sections](#minimum-sections-logical) so users do not miss lines that require a decision.
- This matches the matching strategy’s bias toward **`review_needed`** when uncertainty is high ([Latvian product matching](latvian-product-matching.md)).

---

## Checkout handoff

- **`checkoutHandoffReached`** must be reflected clearly in the run header (or equivalent).
- When **false**, **`handoffMessage`** should be shown when the implementation provides it (reason or next step in plain language).
- Do **not** report payment success/failure or checkout completion; the user continues **manually** on Barbora after handoff ([user flow](user-flow.md)).

---

## Optional cart-level information

If the implementation **observes** cart-level facts during automation, the summary **may** include them as **non-authoritative** hints, for example:

- Approximate **line count** in the cart after the run
- **Subtotal** or **total** as displayed on Barbora (string or numeric, as captured)

These values are **best-effort**; Barbora’s live UI remains the source of truth for price and cart contents. Omit this block entirely when nothing reliable was observed.

---

## Explicitly out of scope

- Detailed **telemetry** (timings, traces, spans), selector debug dumps, screenshot references as a required part of the summary
- **Payment** workflow, payment methods, or payment results
- **Persistence** schema (tables, files, migrations)
- **Dashboard or full UI specification** (layout, components, themes)
- Defining a **single mandatory** JSON/YAML/XML schema for all implementations

Low-level logging may exist elsewhere; it is not the run summary.

---

## Examples (illustrative structure)

The examples below show **logical content** only. They are **not** a prescribed wire format—implementations may render the same information as prose, tables, or any serialization.

### Example A — Mostly successful, handoff reached

```text
Run: run-2026-04-01-001
Checkout handoff: yes

Lines:
  lineId: 1
    outcome: added
    barboraLabel: Tere piens 2,5%, 2 l
    quantityAdded: 1
    userMessage: Pievienots grozam.

  lineId: 2
    outcome: added
    barboraLabel: Pilngraudu maize, 400 g
    quantityAdded: 2
    userMessage: Divi iepakojumi pievienoti.

Observed (optional):
  cartLineCount: 2
```

### Example B — Substitutions, skipped, review needed, handoff not reached

```text
Run: run-2026-04-01-002
Checkout handoff: no
handoffMessage: Pārtraukts pirms kases soļa: pārlūka kļūda atverot grozu.

Needs attention (2 lines):
  lineId: 4
    outcome: review_needed
    userMessage: Vairāki līdzīgi jogurti; izvēlieties preci Barbora lapā.

  lineId: 5
    outcome: review_needed
    userMessage: Prece nav atrasta; pārbaudiet meklēšanas tekstu.

Other lines:
  lineId: 1
    outcome: substituted
    barboraLabel: Rimi piens 2,5%, 2 l
    quantityAdded: 1
    userMessage: Jūsu parastais zīmols nebija pieejams; pievienots līdzīgs 2 l piens.

  lineId: 2
    outcome: skipped
    userMessage: Aizvietojumi nav atļauti un izvēlētā prece nebija pieejama.

  lineId: 3
    outcome: added
    barboraLabel: Banāni, 1 kg
    quantityAdded: 1
    userMessage: Pievienots grozam.
```

---

## Related documents

- [Data model](data-model.md) — `RunResultSummary` and per-line fields.  
- [Latvian product matching](latvian-product-matching.md) — outcomes vs confidence and substitution policy.  
- [System design](system-design.md) — summary / reporting boundary.  
- [User flow](user-flow.md) — input through handoff and manual payment.
