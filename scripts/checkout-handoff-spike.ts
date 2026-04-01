import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

import { runBarboraAddToCartSpike } from '../src/executor/barboraAddToCartSpike';
import { runBarboraCheckoutHandoffSpike } from '../src/executor/barboraCheckoutHandoffSpike';
import { runBarboraSearchAndCollect } from '../src/executor/barboraSearchSpike';
import { hasStorageState, storageStateContextOptions } from '../src/session/storageState';

function parseArgs(argv: string[]): {
  url: string;
  query: string;
  pick: number;
  headed: boolean;
  json: boolean;
  bootstrap: boolean;
} {
  let url = '';
  let query = '';
  let pick = 1;
  let headed = false;
  let json = false;
  let bootstrap = false;
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--url' || a === '-u') {
      url = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--query' || a === '-q') {
      query = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--pick' || a === '-p') {
      pick = Math.max(1, parseInt(rest.shift() ?? '1', 10) || 1);
      continue;
    }
    if (a === '--headed') {
      headed = true;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--bootstrap') {
      bootstrap = true;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    printHelp();
    process.exit(1);
  }
  return { url, query, pick, headed, json, bootstrap };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/checkout-handoff-spike.ts [options]

Primary path (default):
  Assumes a cart-bearing session with at least one item already in the Barbora cart.
  Opens the cart (/grozs), proceeds toward checkout, and stops at the pre-payment checkout summary
  (https://www.barbora.lv/checkout).

Optional convenience (secondary):
      --bootstrap           Add one product to the cart first (same product args as add-to-cart spike).
  -u, --url <https://...>   Product page URL (with --bootstrap)
  -q, --query <text>        Search query (with --bootstrap)
  -p, --pick <n>            Search result index (default 1)

Options:
      --headed              Show browser window
      --json                Print JSON summary to stdout
  -h, --help                This message

Examples:
  npm run spike:checkout-handoff -- --headed
  npm run spike:checkout-handoff -- --bootstrap --query "piens" --pick 1

Session: uses .auth/barbora-storage-state.json when present (see npm run session:bootstrap).
`);
}

async function resolveProductUrlFromSearch(page: Page, query: string, pick: number): Promise<string> {
  if (!query.trim()) {
    throw new Error(
      '[checkout-handoff-spike] missing --query for search mode. Provide --url <https://...> or --query with --pick.',
    );
  }
  const candidates = await runBarboraSearchAndCollect(page, { query, topN: Math.max(pick, 10) });
  const chosen = candidates.find((c) => c.index === pick);
  if (!chosen) {
    throw new Error(
      `[checkout-handoff-spike] pick out of range: --pick ${pick} but only ${candidates.length} result(s) collected.`,
    );
  }
  if (!chosen.productUrl) {
    throw new Error(
      `[checkout-handoff-spike] missing product URL for search result #${pick} ("${chosen.title}"). Use --url with a direct product page.`,
    );
  }
  return chosen.productUrl;
}

async function main(): Promise<void> {
  const { url, query, pick, headed, json, bootstrap } = parseArgs(process.argv.slice(2));

  if (bootstrap && !url.trim() && !query.trim()) {
    console.error(
      '[checkout-handoff-spike] --bootstrap requires --url <https://...> or --query "<text>" (and optional --pick).',
    );
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (hasStorageState()) {
    console.log('Using saved Barbora session (.auth / BARBORA_STORAGE_STATE_PATH).');
  } else {
    console.log('No saved session file; continuing as anonymous (checkout handoff may redirect to login).');
  }

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    ...storageStateContextOptions(),
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    if (bootstrap) {
      let productUrl = url.trim();
      if (!productUrl) {
        console.log(`[bootstrap] Resolving product URL from search: query="${query}" pick=${pick} …`);
        productUrl = await resolveProductUrlFromSearch(page, query, pick);
        console.log(`[bootstrap] Using product URL: ${productUrl}`);
      } else {
        console.log(`[bootstrap] Using product URL (--url): ${productUrl}`);
      }
      await runBarboraAddToCartSpike(page, { productUrl });
      console.log('[bootstrap] Add-to-cart completed; running checkout handoff…');
    }

    const result = await runBarboraCheckoutHandoffSpike(page, {});

    if (json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } else {
      console.log('');
      console.log('handoffReached: ', result.handoffReached);
      console.log('finalUrl:      ', result.finalUrl);
      console.log('cartSignal:    ', result.cartSignalBefore ?? '(n/a)');
      console.log('message:       ', result.message);
      console.log('steps:         ', result.stepsAttempted.join(' → '));
      if (result.handoffDetectedVia?.kind === 'combined') {
        console.log('handoffDetectedVia:', JSON.stringify(result.handoffDetectedVia, null, 2));
      }
      console.log('');
      console.log('OK — checkout handoff point reached (pre-payment). Complete checkout manually on Barbora.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
