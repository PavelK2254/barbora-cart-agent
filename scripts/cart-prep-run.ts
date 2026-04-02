import * as fs from 'node:fs';
import * as path from 'node:path';

import { chromium } from '@playwright/test';

import { runCartPrepRun, type CartPrepInputLine } from '../src/run/cartPrepRun';
import { formatRunSummaryHuman } from '../src/run/formatRunSummary';
import { hasStorageState, storageStateContextOptions } from '../src/session/storageState';

function parseArgs(argv: string[]): {
  queries: string[];
  filePath: string;
  topN: number;
  handoff: boolean;
  headed: boolean;
  json: boolean;
  knownMappingsPath: string;
} {
  const queries: string[] = [];
  let filePath = '';
  let topN = 10;
  let handoff = false;
  let headed = false;
  let json = false;
  let knownMappingsPath = 'known-mappings.json';
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--file' || a === '-f') {
      filePath = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--query' || a === '-q') {
      queries.push((rest.shift() ?? '').trim());
      continue;
    }
    if (a === '--top' || a === '-n') {
      topN = Math.max(1, parseInt(rest.shift() ?? '10', 10) || 10);
      continue;
    }
    if (a === '--handoff') {
      handoff = true;
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
    if (a === '--known-mappings') {
      knownMappingsPath = (rest.shift() ?? '').trim();
      if (!knownMappingsPath) {
        console.error('[cart-prep-run] --known-mappings requires a path');
        printHelp();
        process.exit(1);
      }
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    printHelp();
    process.exit(1);
  }
  return { queries, filePath, topN, handoff, headed, json, knownMappingsPath };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/cart-prep-run.ts [options]

Orchestrated cart-prep (MVP): for each line, use known-mappings.json when it matches, else search Barbora,
pick one product by deterministic title overlap, add to cart.
Checkout handoff is optional and off by default (no payment automation).

Input (combine as needed):
  -q, --query <text>   Search string (repeat for multiple items; processed first, in order)
  -f, --file <path>    UTF-8 file, one non-empty trimmed line per search query (after -q lines)

Options:
  -n, --top <n>        Max SERP cards to read (default 10)
      --handoff        After all lines, navigate toward checkout (still stops before payment)
      --headed         Show browser window
      --json           Print RunResultSummary JSON to stdout
      --known-mappings <path>  Known product mappings JSON (default: known-mappings.json in cwd; missing = no mappings)
  -h, --help           This message

Exit codes:
  0 — Run finished (including lines skipped or review_needed; see summary).
  1 — Fatal: bad args, missing input, I/O error, or unexpected crash before summary.

Examples:
  npm run run:cart-prep -- -q "piens" -q "maize"
  npm run run:cart-prep -- --file shopping.txt --headed
  npm run run:cart-prep -- --file shopping.txt --handoff --json

Session: uses .auth/barbora-storage-state.json when present (see npm run session:bootstrap).
`);
}

function loadQueriesFromFile(filePath: string): string[] {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function buildInputLines(queriesFromFlags: string[], fileQueries: string[]): CartPrepInputLine[] {
  const all = [...queriesFromFlags, ...fileQueries];
  return all.map((query, i) => ({ lineId: String(i + 1), query }));
}

async function main(): Promise<void> {
  const { queries, filePath, topN, handoff, headed, json, knownMappingsPath } = parseArgs(
    process.argv.slice(2),
  );

  let fileQueries: string[] = [];
  if (filePath) {
    try {
      fileQueries = loadQueriesFromFile(filePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[cart-prep-run] cannot read --file: ${msg}`);
      process.exitCode = 1;
      return;
    }
  }

  const inputLines = buildInputLines(queries, fileQueries);
  if (inputLines.length === 0) {
    if (filePath) {
      const resolved = path.resolve(process.cwd(), filePath);
      console.error(
        `[cart-prep-run] no shopping lines after reading --file (${resolved}). ` +
          'The file must contain at least one non-empty line (whitespace-only lines are ignored). Save the file and ensure it is UTF-8 text.',
      );
    } else {
      console.error(
        '[cart-prep-run] no shopping lines: pass -q/--query and/or --file with non-empty lines.',
      );
    }
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (hasStorageState()) {
    console.log('Using saved Barbora session (.auth / BARBORA_STORAGE_STATE_PATH).');
  } else {
    console.log('No saved session file; continuing as anonymous (checkout handoff may require login).');
  }

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    ...storageStateContextOptions(),
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    const summary = await runCartPrepRun(page, inputLines, {
      topN,
      attemptHandoff: handoff,
      knownMappingsPath,
    });

    if (json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatRunSummaryHuman(summary));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
