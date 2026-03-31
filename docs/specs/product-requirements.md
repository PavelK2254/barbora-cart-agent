# Product requirements (MVP)

## Problem

Ordering groceries on Barbora means repeating the same work: finding items, adding them to the cart, and navigating to checkout. People want less tedious clicking and searching, but still want to **review the cart and pay themselves**.

## MVP scope

The MVP delivers a **narrow, realistic** path:

- **Input:** User provides a shopping intent (e.g. a list of items to buy). Exact input format is not fixed in this document; it will be defined when implementation and data models are specified.
- **Item resolution and cart building:** The system works toward a filled Barbora cart that reflects that intent (how items are resolved on Barbora is implementation detail outside this MVP spec).
- **Review:** User **reviews the cart on Barbora** (Barbora’s own UI) before moving to checkout.
- **Checkout handoff:** User is brought to a state where they can proceed to Barbora checkout with the prepared cart.
- **Payment:** User completes payment **manually** on Barbora. The agent does not pay, submit the order, or automate payment.

**Latvian (documentation level):** Barbora product names, search terms, and product listings may be in Latvian. MVP requirements and user-facing documentation should acknowledge that; **matching or search strategy is not specified here.**

**Explicitly not in this document:** The full **run summary** spec (structure, fields, presentation rules). See [run summary](run-summary.md). A review step on Barbora before checkout is in scope here; how results are logged or summarized in detail is not.

## Non-goals

- Automating or completing **payment** or **order placement**.
- Guaranteeing **stock**, **price**, or **delivery slot** availability.
- **Substitutions** or a full substitutions engine.
- Bypassing **login**, **session**, or **security** mechanisms.
- **Unattended** “buy everything with no human in the loop” operation.
- Defining **browser automation**, **Playwright**, or **persistence** implementation in this MVP doc (covered by implementation and other tasks).

## Success criteria

MVP documentation and intent are successful if:

- It is **unambiguous** that the agent prepares the cart and **never pays**.
- A reader can follow the **end-to-end intent**: list → cart preparation → review on Barbora → checkout handoff → manual payment.
- **Latvian** context for Barbora listings is **acknowledged** without over-specifying technical matching.
- Scope stays **narrow** and does not promise features listed under non-goals.
