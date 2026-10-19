import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { connectorExchanges } from '../database/schema.js';

export type ConnectorExchange = typeof connectorExchanges.$inferSelect;
export type NewConnectorExchange = Omit<typeof connectorExchanges.$inferInsert, 'id' | 'recordedAt'>;

/** Keeps one request to the connector and its answer as evidence. Rows are never changed. */
export async function recordExchange(db: Database, exchange: NewConnectorExchange): Promise<void> {
  await db.insert(connectorExchanges).values(exchange);
}

/** The issuer's exchanges with the connector, oldest first; optionally only those of one InvoiceRecord. */
export async function findConnectorExchanges(
  db: Database,
  issuerId: string,
  { invoiceRecordId }: { invoiceRecordId?: string } = {},
): Promise<ConnectorExchange[]> {
  return db
    .select()
    .from(connectorExchanges)
    .where(
      and(
        eq(connectorExchanges.issuerId, issuerId),
        invoiceRecordId ? eq(connectorExchanges.invoiceRecordId, invoiceRecordId) : undefined,
      ),
    )
    .orderBy(asc(connectorExchanges.recordedAt));
}
