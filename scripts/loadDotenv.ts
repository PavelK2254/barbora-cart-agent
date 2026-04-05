import * as path from 'node:path';

import { config } from 'dotenv';

/**
 * Load `.env` from the current working directory before other app code reads `process.env`.
 * Does not override variables already set in the environment.
 */
config({ path: path.resolve(process.cwd(), '.env') });
