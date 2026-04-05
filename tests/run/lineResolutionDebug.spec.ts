import { expect, test } from '@playwright/test';

import { llmDebugBeforeLlmCall } from '../../src/run/llmLineDebug';

test('LLM debug classification: not_configured when LLM is not configured', () => {
  const r = llmDebugBeforeLlmCall({
    llmResolvePresent: false,
    reviewReason: 'ambiguous_match',
    llmSliceLength: 3,
  });
  expect(r).toEqual({ llmEligible: false, llmAttempted: false, llmOutcome: 'not_configured' });
});

test('LLM debug classification: skipped_ineligible when reason is not ambiguous/weak', () => {
  const r = llmDebugBeforeLlmCall({
    llmResolvePresent: true,
    reviewReason: 'no_candidates',
    llmSliceLength: 0,
  });
  expect(r.llmOutcome).toBe('skipped_ineligible');
  expect(r.llmAttempted).toBe(false);
});

test('LLM debug classification: skipped_no_candidates when eligible but slice empty', () => {
  const r = llmDebugBeforeLlmCall({
    llmResolvePresent: true,
    reviewReason: 'weak_match',
    llmSliceLength: 0,
  });
  expect(r).toEqual({ llmEligible: true, llmAttempted: false, llmOutcome: 'skipped_no_candidates' });
});

test('LLM debug classification: pre-call state when eligible and slice non-empty', () => {
  const r = llmDebugBeforeLlmCall({
    llmResolvePresent: true,
    reviewReason: 'ambiguous_match',
    llmSliceLength: 2,
  });
  expect(r).toEqual({ llmEligible: true, llmAttempted: true, llmOutcome: 'no_choice' });
});
