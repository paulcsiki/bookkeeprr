import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './client';
import { logger } from '../logger.js';

const db = getDb();
migrate(db, { migrationsFolder: './drizzle' });
logger().info('migrations applied');
process.exit(0);
