import { Inject, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema.js';

export const DATABASE = Symbol('DATABASE');
export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };
/** The database or a transaction on it. */
export type Queryable = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/**
 * Runs `work` in a transaction on one connection of the pool. `client` is that connection, for
 * statements that do not go through Drizzle but must be part of the transaction (e.g. pg-boss jobs).
 */
export async function inTransaction<T>(
  db: Database,
  work: (tx: Queryable, client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.$client.connect();
  try {
    return await drizzle({ client, schema }).transaction((tx) => work(tx, client));
  } finally {
    client.release();
  }
}

@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  static forRoot(databaseUrl: string): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: DATABASE,
          useFactory: (): Database =>
            drizzle({ client: new pg.Pool({ connectionString: databaseUrl }), schema }),
        },
      ],
      exports: [DATABASE],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }
}
