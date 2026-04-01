import { expect, test } from '@playwright/test';
import {
  hasStorageState,
  storageStateContextOptions,
} from '../../src/session/storageState';

test.describe('Barbora session reuse', () => {
  test.skip(
    !hasStorageState(),
    'No saved Barbora session; run: npm run session:bootstrap',
  );

  test('opens barbora.lv using saved storage state', async ({ browser }) => {
    const context = await browser.newContext({
      ...storageStateContextOptions(),
    });
    const page = await context.newPage();
    await page.goto('https://www.barbora.lv/');
    await expect(page).toHaveURL(/barbora\.lv/);
    await context.close();
  });
});
