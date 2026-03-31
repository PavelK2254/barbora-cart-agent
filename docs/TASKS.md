# TASKS

This file is the planning backlog for `barbora-cart-agent`.

It is intended to be the source used by a separate agent/process to create GitHub issues.
Until then, this document acts as the source of truth for planning and task sequencing.

## Conventions
- Keep tasks focused and reviewable.
- Prefer one task = one issue = one PR.
- Do not mix unrelated refactors into implementation tasks.
- Specs and design tasks should come before implementation tasks.
- Payment must never be automated.
- Latvian product names and listings are a first-class concern.

---

## TASK-001 — Define MVP scope and core user flow
**Type:** spec
**Priority:** high
**Status:** todo

### Goal
Define the initial MVP scope for barbora-cart-agent and document the end-to-end user flow from shopping input to checkout handoff.

### Why
Before implementing browser automation or product matching, the project needs a clear source of truth for what the product does, what is in scope for v1, and what is explicitly out of scope.

### Scope
Create initial documentation for:
- MVP goal
- primary user problem
- core user flow
- key constraints
- non-goals
- acceptance criteria for the first working version

### Deliverables
- `README.md`
- `docs/specs/product-requirements.md`
- `docs/specs/user-flow.md`

### Out of scope
- Playwright setup
- browser automation
- login/session implementation
- product matching implementation
- persistence layer
- substitutions engine

### Acceptance criteria
- The repository has an initial README describing the project clearly.
- A product requirements spec exists and defines MVP scope.
- A user flow spec exists and describes the end-to-end happy path.
- The docs clearly state that payment is never automated.
- The docs clearly state that Latvian product names/listings are a core consideration.

---

## TASK-002 — Define system design and module boundaries
**Type:** spec
**Priority:** high
**Status:** todo

### Goal
Describe the initial system architecture and define the main modules for the MVP.

### Why
The project should separate deterministic browser automation from product resolution and future reasoning logic.

### Scope
Document the main system components and their responsibilities, including:
- input/planning layer
- product resolver
- browser/cart executor
- preference/memory store
- summary/reporting layer

### Deliverables
- `docs/specs/system-design.md`

### Out of scope
- actual implementation of modules
- API design for future multi-store support

### Acceptance criteria
- Each module has a clear responsibility.
- Boundaries between deterministic logic and future reasoning are explicit.
- The MVP architecture is understandable without reading code.

---

## TASK-003 — Define data model for shopping items and run results
**Type:** spec
**Priority:** high
**Status:** todo

### Goal
Define the data structures used by the MVP.

### Why
A clear data model reduces ambiguity before implementing search, matching, cart actions, and summaries.

### Scope
Define schemas for:
- shopping item input
- normalized/canonical item
- known product mapping
- substitution policy
- run result summary

### Deliverables
- `docs/specs/data-model.md`

### Acceptance criteria
- Core entities are documented with fields and examples.
- The model supports Latvian aliases and known product mappings.
- The model is sufficient for MVP automation and summary reporting.

---

## TASK-004 — Define Latvian product matching strategy
**Type:** spec
**Priority:** high
**Status:** todo

### Goal
Describe how the system should handle product discovery and matching when Barbora listings are in Latvian.

### Why
Language and catalog ambiguity are a core challenge in this project.

### Scope
Document:
- canonical item naming
- alias strategy
- Latvian keyword handling
- exact match vs substitute flow
- ranking/fallback strategy
- confidence thresholds for add-to-cart vs manual review

### Deliverables
- `docs/specs/latvian-product-matching.md`

### Acceptance criteria
- The matching approach is clear and practical.
- The design does not rely on naive translation alone.
- The strategy supports incremental improvement over time.

---

## TASK-005 — Initialize Playwright project scaffold
**Type:** implementation
**Priority:** medium
**Status:** todo

### Goal
Set up the initial Playwright-based project structure for browser automation.

### Why
The project needs a deterministic automation foundation before implementing shopping flows.

### Scope
- initialize the project
- define basic folder structure
- add minimal configuration
- add a simple smoke test scaffold

### Out of scope
- Barbora-specific automation
- login/session persistence
- cart actions

### Acceptance criteria
- The project can run a basic Playwright command successfully.
- The repo structure supports future browser automation work.

---

## TASK-006 — Implement persistent login/session strategy
**Type:** implementation
**Priority:** medium
**Status:** todo

### Goal
Define and implement a safe way to persist a Barbora session for repeated runs.

### Why
Repeated manual login would reduce the value of the agent.

### Scope
- choose a storage strategy for session/auth state
- document security considerations
- implement the first session reuse mechanism

### Out of scope
- solving advanced anti-bot flows
- payment details

### Acceptance criteria
- A valid session can be reused across runs in the local development workflow.
- Security tradeoffs are documented.

---

## TASK-007 — Implement product search spike
**Type:** implementation
**Priority:** medium
**Status:** todo

### Goal
Verify that a query can be entered on Barbora and product results can be collected deterministically.

### Why
This is the first important technical proof that the automation flow is viable.

### Scope
- search for a product term
- wait for results reliably
- collect basic result information for inspection

### Out of scope
- ranking logic
- add to cart
- substitutions

### Acceptance criteria
- The script can search for at least one product term and capture structured result data.
- The result extraction approach is documented well enough for future tasks.

---

## TASK-008 — Implement add-to-cart spike
**Type:** implementation
**Priority:** medium
**Status:** todo

### Goal
Demonstrate that a selected product can be added to the Barbora cart.

### Why
This validates the core value path of the product.

### Scope
- select one target result
- add it to cart
- confirm cart state changed

### Out of scope
- multi-item flows
- substitutions
- checkout handoff

### Acceptance criteria
- A single product can be added to the cart in a repeatable way.
- The script can verify success reliably.

---

## TASK-009 — Implement checkout handoff spike
**Type:** implementation
**Priority:** medium
**Status:** todo

### Goal
Demonstrate navigation from cart to the point where the user can review and complete checkout manually.

### Why
The product promise ends at checkout handoff, not payment.

### Scope
- open cart
- proceed through the pre-payment flow as far as safely possible
- stop before payment completion

### Out of scope
- payment automation
- delivery-slot optimization

### Acceptance criteria
- The flow reaches the intended checkout handoff point.
- The script explicitly stops before any payment action.

---

## TASK-010 — Define review summary format
**Type:** spec
**Priority:** medium
**Status:** todo

### Goal
Define the output summary format shown after a run.

### Why
The user must understand what was added, substituted, skipped, or requires review.

### Scope
Define a structured summary format for:
- added items
- substituted items
- missing items
- review-needed items
- total/estimated cost if available

### Deliverables
- `docs/specs/run-summary.md`

### Acceptance criteria
- The summary format is easy for both humans and agents to consume.
- The summary supports future UI/reporting needs.

---

## TASK-011 — Implement known product mapping store
**Type:** implementation
**Priority:** low
**Status:** todo

### Goal
Store previously confirmed mappings between user-intent items and Barbora products.

### Why
Recurring purchases should become more reliable and less ambiguous over time.

### Scope
- define a local storage format
- save known mappings
- reuse known mappings before broad search

### Acceptance criteria
- The system can persist at least one known product mapping and reuse it in a future run.

---

## TASK-012 — Implement first substitution policy
**Type:** implementation
**Priority:** low
**Status:** todo

### Goal
Handle basic substitution behavior when an exact preferred product is unavailable.

### Why
The agent should avoid failing on every out-of-stock situation.

### Scope
- define a minimal substitution policy
- support allow/disallow substitute behavior
- report substitutions clearly

### Acceptance criteria
- A missing preferred product can lead to either a substitute or a review-needed outcome based on policy.
- Substitutions are surfaced clearly in the summary.
