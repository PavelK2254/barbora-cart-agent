import { llmFallbackEligibleReason } from '../llm';
import type { ResolverReviewReasonCode } from '../resolver/resolveShoppingLine';
import type { LineResolutionDebug } from './runTypes';

/**
 * LLM path before an optional `llmResolve` call (orchestration-only; TASK-019).
 * `no_choice` here is a pre-attempt placeholder only. After `await llmResolve`, set `llmOutcome` to
 * `chose` or a specific post-attempt outcome (`model_review_needed`, `empty_response`, `invalid_json`, …).
 */
export function llmDebugBeforeLlmCall(params: {
  llmResolvePresent: boolean;
  reviewReason: ResolverReviewReasonCode;
  llmSliceLength: number;
}): Pick<LineResolutionDebug, 'llmEligible' | 'llmAttempted' | 'llmOutcome'> {
  if (!params.llmResolvePresent) {
    return { llmEligible: false, llmAttempted: false, llmOutcome: 'not_configured' };
  }
  if (!llmFallbackEligibleReason(params.reviewReason)) {
    return { llmEligible: false, llmAttempted: false, llmOutcome: 'skipped_ineligible' };
  }
  if (params.llmSliceLength === 0) {
    return { llmEligible: true, llmAttempted: false, llmOutcome: 'skipped_no_candidates' };
  }
  return { llmEligible: true, llmAttempted: true, llmOutcome: 'no_choice' };
}
