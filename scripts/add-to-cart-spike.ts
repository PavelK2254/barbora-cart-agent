import './loadDotenv';

import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

import { runBarboraAddToCartSpike } from '../src/executor/barboraAddToCartSpike';
import { runBarboraSearchAndCollect } from '../src/executor/barboraSearchSpike';
import { hasStorageState, storageStateContextOptions } from '../src/session/storageState';

function parseArgs(argv: string[]): {
  url: string;
  query: string;
  pick: number;
  headed: boolean;
  json: boolean;
} {
  let url = '';
  let query = '';
  let pick = 1;
  let headed = false;
  let json = false;
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
    console.error(`Unknown argument: ${a}`);
    printHelp();
    process.exit(1);
  }
  return { url, query, pick, headed, json };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/add-to-cart-spike.ts [options]

Primary path (most reliable):
  -u, --url <https://...>   Full https URL of a Barbora product page (barbora.lv or www.barbora.lv).

Convenience path:
  -q, --query <text>        Search string; use with --pick
  -p, --pick <n>            1-based index from search results (default 1)

Options:
      --headed              Show browser window
      --json                Print JSON summary to stdout
  -h, --help                This message

Examples:
  npm run spike:add-to-cart -- --url "https://www.barbora.lv/produkti/some-product" --headed
  npm run spike:add-to-cart -- --query "piens" --pick 1

Session: uses .auth/barbora-storage-state.json when present (see npm run session:bootstrap).
`);
}

async function resolveProductUrlFromSearch(page: Page, query: string, pick: number): Promise<string> {
  if (!query.trim()) {
    throw new Error(
      '[add-to-cart-spike] missing --query for search mode. Provide --url <https://...> (recommended) or --query with --pick.',
    );
  }
  const candidates = await runBarboraSearchAndCollect(page, { query, topN: Math.max(pick, 10) });
  const chosen = candidates.find((c) => c.index === pick);
  if (!chosen) {
    throw new Error(
      `[add-to-cart-spike] pick out of range: --pick ${pick} but only ${candidates.length} result(s) collected. Increase search coverage or lower --pick.`,
    );
  }
  if (!chosen.productUrl) {
    throw new Error(
      `[add-to-cart-spike] missing product URL for search result #${pick} ("${chosen.title}"). No /produkti/ link on that card — use --url with a direct product page instead.`,
    );
  }
  return chosen.productUrl;
}

async function main(): Promise<void> {
  const { url, query, pick, headed, json } = parseArgs(process.argv.slice(2));

  if (!url && !query) {
    console.error(
      '[add-to-cart-spike] missing input: provide --url <https://...> (primary) or --query "<text>" with optional --pick (convenience).',
    );
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (hasStorageState()) {
    console.log('Using saved Barbora session (.auth / BARBORA_STORAGE_STATE_PATH).');
  } else {
    console.log('No saved session file; continuing as anonymous (add-to-cart may still work).');
  }

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    ...storageStateContextOptions(),
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    let productUrl = url.trim();
    if (!productUrl) {
      console.log(`Resolving product URL from search: query="${query}" pick=${pick} …`);
      productUrl = await resolveProductUrlFromSearch(page, query, pick);
      console.log(`Using product URL: ${productUrl}`);
    } else {
      console.log(`Using product URL (--url): ${productUrl}`);
    }

    const result = await runBarboraAddToCartSpike(page, { productUrl });

    if (json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } else {
      console.log('');
      console.log('beforeSignal:', result.beforeSignal);
      console.log('afterSignal: ', result.afterSignal);
      console.log('message:    ', result.message);
      console.log('');
      console.log('OK — cart signal indicates the product was added.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
