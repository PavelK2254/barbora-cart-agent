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

## Usage

### Prerequisites

- **Node.js** 20 or newer (`node -v`)
- A Barbora account if you want checkout handoff or a saved session (you log in yourself; see below)

### Setup

1. Install dependencies: `npm install`
2. Install Playwright browsers: `npm run playwright:install`
3. **Environment (optional):** copy [`.env.example`](.env.example) to `.env` in the project root and set variables as needed. Scripts load `.env` from the current working directory (see [`scripts/loadDotenv.ts`](scripts/loadDotenv.ts)). Main knobs:
   - **`BARBORA_STORAGE_STATE_PATH`** — optional path to saved login state (default: `.auth/barbora-storage-state.json`)
   - **LLM fallback** — set `BARBORA_LLM_ENABLED=true` and `BARBORA_LLM_API_KEY` if you want Gemini/OpenAI help when deterministic matching is weak; see `.env.example` for provider and model options

### Saved Barbora session (recommended for logged-in flows)

To reuse a normal browser login (cookies/storage) across runs:

1. `npm run session:bootstrap`
2. Log in to Barbora in the window that opens, then press **Enter** in the terminal to save state.

Details, security notes, and troubleshooting: [Local Barbora session (dev)](docs/session-local-development.md).

### Prepare the cart (main command)

```bash
npm run run:cart-prep -- -q "piens" -q "maize"
```

```bash
npm run run:cart-prep -- --file shopping.txt
```

- **Input:** `-q` / `--query` can be repeated (processed first, in order). `--file` adds lines from a UTF-8 text file (one non-empty trimmed line per item). You must supply at least one query or file line.
- **Useful flags:** `--headed` (show the browser), `--handoff` (navigate toward checkout after items; still no payment automation), `--json` (print a machine-readable run summary on stdout), `--debug` (per-line resolver/LLM debug; with `--json` it is included in stdout, otherwise it goes to stderr).
- **Known mappings:** optional `known-mappings.json` in the project root maps your shopping lines to product URLs Barbora already knows. Override path with `--known-mappings <path>`. To merge approved lines from a past `--json` run into that file: `npm run known-mappings:persist -- --run <summary.json> --lines <id,id,...>` (see script help for `--dry-run` and other options).

Full CLI help:

```bash
npx tsx scripts/cart-prep-run.ts --help
```

### Spikes and tests

| Command | Purpose |
| --- | --- |
| `npm run spike:search` | Search Barbora and print candidates (no cart) |
| `npm run spike:add-to-cart` | Exercise add-to-cart flow |
| `npm run spike:checkout-handoff` | Exercise checkout handoff |
| `npm test` | Playwright test suite |
| `npm run test:headed` | Same tests with a visible browser |

Spike scripts accept `--help` for their own options. Search spike example: `npm run spike:search -- --query "piens" --top 5` (see [session doc](docs/session-local-development.md)).

## Documentation

- [Local Barbora session (dev)](docs/session-local-development.md) — save/reuse login for Playwright; not committed to git.
- [Product requirements](docs/specs/product-requirements.md) — problem, MVP scope, non-goals, success criteria.
- [User flow](docs/specs/user-flow.md) — input through checkout handoff.

## License

See [LICENSE](LICENSE).
