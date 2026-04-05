import './loadDotenv';

import { chromium } from '@playwright/test';

import { runBarboraSearchAndCollect } from '../src/executor/barboraSearchSpike';
import type { SearchCandidate } from '../src/executor/searchCandidate';
import { hasStorageState, storageStateContextOptions } from '../src/session/storageState';

function parseArgs(argv: string[]): {
  query: string;
  top: number;
  headed: boolean;
  json: boolean;
} {
  let query = '';
  let top = 10;
  let headed = false;
  let json = false;
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--query' || a === '-q') {
      query = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--top' || a === '-n') {
      top = Math.max(1, parseInt(rest.shift() ?? '10', 10) || 10);
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
    if (!a.startsWith('-') && !query) {
      query = a.trim();
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    printHelp();
    process.exit(1);
  }
  return { query, top, headed, json };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/search-spike.ts [options] "<query>"

Options:
  -q, --query <text>   Search string (Latvian ok)
  -n, --top <n>        Max results to print (default 10)
      --headed         Show browser window
      --json           Print JSON instead of text table
  -h, --help           This message

Positional query is accepted if it is the first non-flag argument.
`);
}

function printHuman(query: string, candidates: SearchCandidate[]): void {
  console.log(`Query: ${query}`);
  console.log(`Results (showing ${candidates.length}):`);
  console.log('');
  for (const c of candidates) {
    console.log(`--- #${c.index} ---`);
    console.log(`title:       ${c.title}`);
    console.log(`url:         ${c.productUrl ?? '(none)'}`);
    console.log(`price:       ${c.priceText ?? '(unknown)'}`);
    console.log(`unit/pack:   ${c.packSizeText ?? '(unknown)'}`);
    console.log('');
  }
}

async function main(): Promise<void> {
  const { query, top, headed, json } = parseArgs(process.argv.slice(2));
  if (!query) {
    console.error('Missing search query. Use --query "<text>" or pass it as the first argument.');
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (hasStorageState()) {
    console.log('Using saved Barbora session (.auth / BARBORA_STORAGE_STATE_PATH).');
  } else {
    console.log('No saved session file; continuing as anonymous (search may still work).');
  }

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    ...storageStateContextOptions(),
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    const candidates = await runBarboraSearchAndCollect(page, { query, topN: top });
    if (json) {
      console.log(JSON.stringify({ query, count: candidates.length, candidates }, null, 2));
    } else {
      printHuman(query, candidates);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
