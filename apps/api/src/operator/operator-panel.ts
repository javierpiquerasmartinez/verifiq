import { Inject, Injectable } from '@nestjs/common';
import {
  AWAITING_VERDICT_STATUSES,
  invoiceNumberIn,
  unconfirmedBefore,
  type OperatorIssuer,
  type RecordAlert,
  type RecordAlertKind,
} from '@verifiq/domain';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoices, issuers } from '../database/schema.js';
import { latestRecords } from '../invoices/invoice-list.js';
import { knownRepresentation, REPRESENTATION_OPTIONS, type RepresentationOptions } from '../issuers/representation.js';

/**
 * What the operator's panel shows of every issuer: who it is and how it is doing. It reads across
 * issuers, so it must select only operational columns: never an invoice's copy, its lines, its amounts
 * or its recipient (spec, story 93), nor an AEAT message, which may name the recipient.
 */
@Injectable()
export class OperatorPanelService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REPRESENTATION_OPTIONS) private readonly representation: RepresentationOptions,
  ) {}

  /** Every issuer, by name, with its last known Representation, its invoices and how many have an incident. */
  async issuers(): Promise<OperatorIssuer[]> {
    const { record, category } = latestRecords(this.db, new Date());
    const counts = this.db
      .select({
        issuerId: invoices.issuerId,
        invoiceCount: sql<number>`count(*)::int`.as('invoice_count'),
        openIncidents: sql<number>`(count(*) FILTER (WHERE ${category} = 'incidents'))::int`.as('open_incidents'),
      })
      .from(invoices)
      .innerJoin(record, eq(record.invoiceId, invoices.id))
      .groupBy(invoices.issuerId)
      .as('counts');
    const rows = await this.db
      .select({
        id: issuers.id,
        name: issuers.name,
        taxId: issuers.taxId,
        onboardingCompletedAt: issuers.onboardingCompletedAt,
        connectorRegisteredAt: issuers.connectorRegisteredAt,
        connectorRejection: issuers.connectorRejection,
        representationState: issuers.representationState,
        invoiceCount: counts.invoiceCount,
        openIncidents: counts.openIncidents,
      })
      .from(issuers)
      .leftJoin(counts, eq(counts.issuerId, issuers.id))
      .orderBy(asc(issuers.name), asc(issuers.id));
    return rows.map((row) => {
      const { state, error } = knownRepresentation({ ...row, representationSigningUrl: null }, this.representation, false);
      return {
        id: row.id,
        name: row.name,
        taxId: row.taxId,
        onboardedAt: row.onboardingCompletedAt?.toISOString() ?? null,
        representation: { state, error },
        invoiceCount: row.invoiceCount ?? 0,
        openIncidents: row.openIncidents ?? 0,
      };
    });
  }

  /**
   * The invoices whose latest record the AEAT rejected, the connector blocked, or that is still without
   * its verdict 24 h after the Issuance (a Voiding included), the longest waiting first.
   */
  async alerts(): Promise<RecordAlert[]> {
    const now = new Date();
    const { record } = latestRecords(this.db, now);
    const rows = await this.db
      .select({
        invoiceRecordId: record.id,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        confirmedAt: record.confirmedAt,
        aeatErrorCode: record.aeatErrorCode,
        rejectionCode: record.rejectionCode,
        series: invoices.series,
        number: invoices.number,
        issuerId: issuers.id,
        issuerName: issuers.name,
        issuerTaxId: issuers.taxId,
      })
      .from(invoices)
      .innerJoin(record, eq(record.invoiceId, invoices.id))
      .innerJoin(issuers, eq(issuers.id, invoices.issuerId))
      .where(
        or(
          inArray(record.status, ['rejected', 'blocked']),
          and(inArray(record.status, [...AWAITING_VERDICT_STATUSES]), lte(record.createdAt, unconfirmedBefore(now))),
        ),
      )
    const since = (row: (typeof rows)[number]) =>
      row.status === 'rejected' ? (row.confirmedAt ?? row.createdAt) : row.status === 'blocked' ? row.updatedAt : row.createdAt;
    return rows
      .map((row) => {
        const kind: RecordAlertKind = row.status === 'rejected' || row.status === 'blocked' ? row.status : 'unconfirmed';
        return {
          invoiceRecordId: row.invoiceRecordId,
          kind,
          issuer: { id: row.issuerId, name: row.issuerName, taxId: row.issuerTaxId },
          invoiceNumber: invoiceNumberIn(row.series, row.number),
          since: since(row).toISOString(),
          errorCode: kind === 'rejected' ? row.aeatErrorCode : kind === 'blocked' ? row.rejectionCode : null,
        };
      })
      .sort((a, b) => a.since.localeCompare(b.since) || a.invoiceRecordId.localeCompare(b.invoiceRecordId));
  }
}
