import { expect, test } from '@playwright/test';

import { formatRunSummaryHuman } from '../../src/run/formatRunSummary';
import type { RunResultSummary } from '../../src/run/runTypes';

test('formatRunSummaryHuman surfaces review_needed before other lines', () => {
  const summary: RunResultSummary = {
    runId: 'run-test',
    checkoutHandoffReached: false,
    handoffMessage: 'Checkout handoff was not requested.',
    lines: [
      { lineId: '1', outcome: 'added', userMessage: 'ok', barboraLabel: 'A', quantityAdded: 1 },
      { lineId: '2', outcome: 'review_needed', userMessage: 'check Barbora' },
    ],
  };
  const text = formatRunSummaryHuman(summary);
  expect(text).toContain('Needs attention (1 line(s)):');
  expect(text.indexOf('Needs attention')).toBeLessThan(text.indexOf('Line outcomes:'));
  expect(text).toContain('lineId: 2');
  expect(text).toContain('Checkout handoff: no');
});

test('formatRunSummaryHuman does not print lineDebug (TASK-019)', () => {
  const summary: RunResultSummary = {
    runId: 'run-test',
    checkoutHandoffReached: true,
    lines: [
      {
        lineId: '1',
        outcome: 'added',
        userMessage: 'ok',
        barboraLabel: 'A',
        quantityAdded: 1,
        lineDebug: {
          knownMappingHit: false,
          serpCandidateCount: 3,
          usableCandidateCount: 2,
          llmEligible: false,
          llmAttempted: false,
          llmOutcome: 'skipped_ineligible',
        },
      },
    ],
  };
  const text = formatRunSummaryHuman(summary);
  expect(text).not.toContain('lineDebug');
  expect(text).not.toContain('serpCandidateCount');
  expect(text).not.toContain('llmOutcome');
});
