// Re-export from the canonical integration seed helper so both
// tests/integration/** and other test roots can use the same import path.
export { seedDb, type SeedHandle, type SeedOpts } from '../integration/helpers/seed';
