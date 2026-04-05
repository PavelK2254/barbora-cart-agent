import './loadDotenv';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from '@playwright/test';
import { getStorageStatePath } from '../src/session/storageState';

const BARBORA_URL = 'https://www.barbora.lv/';

async function main(): Promise<void> {
  const outPath = getStorageStatePath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  console.log('Opening a headed browser. Log in to Barbora in that window.');
  console.log(`Starting URL: ${BARBORA_URL}`);
  console.log('When you are logged in, return here and press Enter to save session state.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BARBORA_URL);

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('Press Enter after you have finished logging in… ');
  } finally {
    rl.close();
  }

  await context.storageState({ path: outPath });
  await browser.close();

  console.log(`\nSaved storage state to: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
