import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_RELATIVE = path.join('.auth', 'barbora-storage-state.json');

/** Absolute path to the Playwright storage state JSON file. */
export function getStorageStatePath(): string {
  const override = process.env.BARBORA_STORAGE_STATE_PATH?.trim();
  if (override) return path.resolve(override);
  return path.resolve(process.cwd(), DEFAULT_RELATIVE);
}

export function hasStorageState(): boolean {
  try {
    fs.accessSync(getStorageStatePath(), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Options to spread into `browser.newContext()` when a saved session exists; otherwise `{}`. */
export function storageStateContextOptions():
  | { storageState: string }
  | Record<string, never> {
  if (!hasStorageState()) return {};
  return { storageState: getStorageStatePath() };
}

export const MISSING_STORAGE_STATE_MESSAGE =
  'Barbora session file is missing. Run `npm run session:bootstrap` to create it (see docs/session-local-development.md).';

export function assertHasStorageState(): void {
  if (!hasStorageState()) {
    throw new Error(MISSING_STORAGE_STATE_MESSAGE);
  }
}
