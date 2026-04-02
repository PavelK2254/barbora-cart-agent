import type { RunLineResult, RunResultSummary } from './runTypes';

function lineIdSortKey(lineId: string): number {
  const n = parseInt(lineId, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function sortLinesByLineId(lines: RunLineResult[]): RunLineResult[] {
  return [...lines].sort((a, b) => lineIdSortKey(a.lineId) - lineIdSortKey(b.lineId));
}

/**
 * Human-oriented summary per docs/specs/run-summary.md (minimum sections).
 */
export function formatRunSummaryHuman(summary: RunResultSummary): string {
  const lines: string[] = [];
  const handoffYesNo = summary.checkoutHandoffReached ? 'yes' : 'no';

  if (summary.runId) {
    lines.push(`Run: ${summary.runId}`);
  }
  lines.push(`Checkout handoff: ${handoffYesNo}`);
  lines.push('');

  const sorted = sortLinesByLineId(summary.lines);
  const needsAttention = sorted.filter((l) => l.outcome === 'review_needed');
  if (needsAttention.length > 0) {
    lines.push(`Needs attention (${needsAttention.length} line(s)):`);
    for (const line of needsAttention) {
      lines.push(formatLineBlock(line));
    }
    lines.push('');
  }

  const others = sorted.filter((l) => l.outcome !== 'review_needed');
  if (others.length > 0) {
    lines.push('Line outcomes:');
    for (const line of others) {
      lines.push(formatLineBlock(line));
    }
    lines.push('');
  }

  if (!summary.checkoutHandoffReached && summary.handoffMessage?.trim()) {
    lines.push('Handoff note:');
    lines.push(`  ${summary.handoffMessage.trim()}`);
  }

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

function formatLineBlock(line: RunLineResult): string {
  const parts: string[] = [];
  parts.push(`  lineId: ${line.lineId}`);
  parts.push(`    outcome: ${line.outcome}`);
  if (line.barboraLabel != null && line.barboraLabel !== '') {
    parts.push(`    barboraLabel: ${line.barboraLabel}`);
  }
  if (line.quantityAdded != null) {
    parts.push(`    quantityAdded: ${line.quantityAdded}`);
  }
  parts.push(`    userMessage: ${line.userMessage}`);
  return parts.join('\n');
}
