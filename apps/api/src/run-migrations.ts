import { loadEnv } from './config.js';
import { migrateDatabase } from './database/migrate.js';

// Pre-deploy step: any failure exits non-zero and aborts the deploy.
await migrateDatabase(loadEnv().DATABASE_URL);
console.log('Migrations applied');
