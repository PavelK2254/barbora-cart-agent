import { expect, test } from '@playwright/test';

import { wrapLlmJsonCompleterWithMinInterval } from '../../src/llm/minIntervalCompleter';
import type { LlmJsonComplete } from '../../src/llm/llmTypes';

test.describe('wrapLlmJsonCompleterWithMinInterval', () => {
  test('passes through when minIntervalMs is 0', async () => {
    let calls = 0;
    const inner: LlmJsonComplete = async () => {
      calls += 1;
      return { ok: true, text: '{}' };
    };
    const w = wrapLlmJsonCompleterWithMinInterval(inner, 0);
    await w('a', 'b');
    await w('a', 'b');
    expect(calls).toBe(2);
  });

  test('spaces consecutive request starts by at least minIntervalMs after prior completes', async () => {
    const starts: number[] = [];
    const inner: LlmJsonComplete = async () => {
      starts.push(Date.now());
      return { ok: true, text: '{}' };
    };
    const w = wrapLlmJsonCompleterWithMinInterval(inner, 40);
    await w('s', 'u');
    await w('s', 'u');
    await w('s', 'u');
    expect(starts.length).toBe(3);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(40);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(40);
  });

  test('serializes concurrent callers', async () => {
    const order: string[] = [];
    const inner: LlmJsonComplete = async () => {
      order.push('inner');
      return { ok: true, text: '{}' };
    };
    const w = wrapLlmJsonCompleterWithMinInterval(inner, 25);
    const p1 = w('s', 'a').then(() => {
      order.push('done-a');
    });
    const p2 = w('s', 'b').then(() => {
      order.push('done-b');
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual(['inner', 'done-a', 'inner', 'done-b']);
  });
});
