# Local Barbora session (development)

This project reuses a **human-created** Barbora login via Playwright [storage state](https://playwright.dev/docs/auth#reuse-signed-in-state): cookies and origin storage are saved to a **local JSON file** so automated runs do not log in for you.

## Security tradeoffs

- The file under `.auth/` is **sensitive**. Anyone who can read it can use your Barbora session until it expires or you log out remotely.
- It is **gitignored** on purpose—do not commit it, paste it into tickets, or sync it to shared drives unless you accept that risk.
- This is **local development** tooling only; there is no cloud session sharing.

## Bootstrap (manual login)

1. Install browsers if needed: `npm run playwright:install`
2. Run: `npm run session:bootstrap`
3. In the opened browser, **log in to Barbora** as you normally would.
4. When you are sure you are logged in, return to the terminal and **press Enter** to save state.

Default output path: `.auth/barbora-storage-state.json` (repo root). Override with env var **`BARBORA_STORAGE_STATE_PATH`** (absolute or relative path resolved from cwd).

## Reuse in code

Import from `src/session/storageState.ts`:

- `storageStateContextOptions()` — spread into `browser.newContext({ ... })` when a file exists; otherwise `{}`.
- `assertHasStorageState()` — throws with a fixed message if the file is missing (use when automation **requires** a session).

## Missing session

If the file is absent, `assertHasStorageState()` fails with instructions to run `npm run session:bootstrap`. Session-aware tests **skip** when no file exists so CI stays green.

## Expired or invalid session

v1 does **not** detect “still logged in.” If Barbora treats you as logged out, **run `npm run session:bootstrap` again** and overwrite the file.

## Search spike (manual)

To exercise Barbora product search and print structured candidates (no cart/checkout):

`npm run spike:search -- --query "piens" --top 5`

Uses the same optional storage state as above. Add `--headed` to watch the browser; add `--json` for machine-readable output.

## Payment

Session reuse does **not** change the product rule: **never** automate payment. Checkout and payment stay manual on Barbora.
