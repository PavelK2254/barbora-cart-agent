/**
 * Persist human-approved cart-prep lines into known-mappings.json (TASK-011).
 * Requires explicit --lines (comma-separated lineId values). Does not auto-persist every added line.
 */

import * as path from 'node:path';

import {
  persistApprovedLinesToKnownMappingsFile,
} from '../src/mappings/persistKnownMappings';

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/persist-known-mappings.ts --run <path> --lines <ids> [options]

Read a cart-prep RunResultSummary JSON (--json from cart-prep-run) and merge selected lines into
known-mappings.json. Only lineIds you list are considered; each must be outcome added and pass checks.
Run files may be UTF-8 (with or without BOM) or UTF-16 LE/BE with BOM (common when saved from Windows).

Required:
  --run <path>           Run summary JSON file
  --lines <id,id,...>    Comma-separated lineId values from that run (required; no bulk default)

Options:
  --known-mappings <path>  Output mappings file (default: known-mappings.json in cwd)
  --dry-run                Print outcomes and merged mappings JSON to stdout; do not write file
  --include-known-mapping-hits
                          Allow persisting lines that resolved from known_mapping (default: skip them)

Merge rule: each new mapping replaces the first existing row that shares any normalized match key
or alias; otherwise it is appended.

Examples:
  npx tsx scripts/persist-known-mappings.ts --run run.json --lines 2,4
  npx tsx scripts/persist-known-mappings.ts --run run.json --lines 1 --dry-run
`);
}

function parseArgs(argv: string[]): {
  runPath: string;
  lineIds: string[];
  knownMappingsPath: string;
  dryRun: boolean;
  includeKnownMappingHits: boolean;
} {
  let runPath = '';
  let linesArg = '';
  let knownMappingsPath = 'known-mappings.json';
  let dryRun = false;
  let includeKnownMappingHits = false;
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--run') {
      runPath = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--lines') {
      linesArg = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--known-mappings') {
      knownMappingsPath = (rest.shift() ?? '').trim();
      if (!knownMappingsPath) {
        console.error('[persist-known-mappings] --known-mappings requires a path');
        process.exit(1);
      }
      continue;
    }
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--include-known-mapping-hits') {
      includeKnownMappingHits = true;
      continue;
    }
    console.error(`[persist-known-mappings] unknown argument: ${a}`);
    printHelp();
    process.exit(1);
  }

  if (!runPath) {
    console.error('[persist-known-mappings] missing required --run <path>');
    printHelp();
    process.exit(1);
  }
  if (!linesArg) {
    console.error('[persist-known-mappings] missing required --lines <id,id,...>');
    printHelp();
    process.exit(1);
  }

  const lineIds = linesArg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (lineIds.length === 0) {
    console.error('[persist-known-mappings] --lines must list at least one non-empty lineId');
    process.exit(1);
  }

  return { runPath, lineIds, knownMappingsPath, dryRun, includeKnownMappingHits };
}

function main(): void {
  const { runPath, lineIds, knownMappingsPath, dryRun, includeKnownMappingHits } = parseArgs(
    process.argv.slice(2),
  );

  try {
    const { outcomes, written, mergedMappings } = persistApprovedLinesToKnownMappingsFile({
      runJsonPath: path.resolve(process.cwd(), runPath),
      knownMappingsPath: path.resolve(process.cwd(), knownMappingsPath),
      approvedLineIds: lineIds,
      dryRun,
      includeKnownMappingHits,
    });

    for (const o of outcomes) {
      if (o.status === 'persisted') {
        console.log(`lineId ${o.lineId}: persisted`);
      } else {
        console.error(`lineId ${o.lineId}: skipped — ${o.reason ?? 'unknown'}`);
      }
    }

    if (dryRun) {
      console.log('\nMerged mappings (dry-run, not written):');
      console.log(JSON.stringify({ mappings: mergedMappings }, null, 2));
    } else if (written) {
      console.log(`\nWrote ${knownMappingsPath}`);
    } else {
      console.log('\nNo mapping file write (dry-run or no eligible lines to persist).');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[persist-known-mappings] ${msg}`);
    process.exitCode = 1;
  }
}

main();
