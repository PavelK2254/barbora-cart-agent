# barbora-cart-agent

Semi-autonomous helper that prepares a [Barbora.lv](https://www.barbora.lv) shopping cart and brings you to checkout. **It does not complete payment**—you pay yourself on Barbora.

This project is **not** affiliated with Barbora. Barbora is a third-party service; use this tool at your own risk.

## What this is

- Reduces friction when turning a shopping list into a Barbora cart.
- Stops at checkout so you can review totals, delivery, and pay in the normal Barbora flow.

## What this is not

- Not full end-to-end purchasing automation.
- Not payment automation (payment is always manual).
- Not a substitute for reading Barbora’s terms, prices, or availability.

## Constraints

- **Payment:** The agent must never complete or automate payment. You complete checkout and pay on Barbora yourself.
- **Latvian:** Barbora product names, search, and listings may be in Latvian. The product and docs assume that; how matching is implemented is out of scope for the MVP specs listed here.

## Documentation

- [Product requirements](docs/specs/product-requirements.md) — problem, MVP scope, non-goals, success criteria.
- [User flow](docs/specs/user-flow.md) — input through checkout handoff.

## License

See [LICENSE](LICENSE).
