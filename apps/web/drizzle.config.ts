import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.BOOKKEEPRR_DB_PATH ?? './bookkeeprr.dev.db',
  },
  strict: true,
  verbose: true,
});
