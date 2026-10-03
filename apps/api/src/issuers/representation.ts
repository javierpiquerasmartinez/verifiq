import { Inject, Injectable } from '@nestjs/common';
import type { Representation, RepresentationSigner } from '@verifiq/domain';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { issuers } from '../database/schema.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import {
  VERIFACTU_CONNECTOR,
  type ConnectorResult,
  type IssuerRef,
  type RepresentationState as ConnectorState,
  type VerifactuConnector,
} from '../verifactu/connector.js';
import { representationLinkEmail } from './emails.js';

export const REPRESENTATION_OPTIONS = Symbol('REPRESENTATION_OPTIONS');

export interface RepresentationOptions {
  /** The AEAT test environment needs no Representation (docs/research/verifactu-verifacti.md). */
  representationRequired: boolean;
}

/** Starting a signing while one is pending, or once signed, would duplicate it (and its cost). */
export class RepresentationInPlaceError extends Error {}

export class RepresentationNotRequiredError extends Error {}

export class RepresentationNotPendingError extends Error {}

/** The connector refused the request; nothing changed. */
export class ConnectorRejectedError extends Error {}

/** The connector did not answer; the same request can be repeated later. */
export class ConnectorUnavailableError extends Error {}

type IssuerRow = typeof issuers.$inferSelect;

const ERROR_STATES = { rejected: 'rejected', expired: 'expired', cancelled: 'cancelled' } as const;

/**
 * Step 5 of the issuer onboarding: the issuer's key at the VeriFactu connector and the remote
 * signing of its Representation. The connector is the source of truth; the last state it reported
 * is kept on the issuer, so a connector outage shows the last known state instead of nothing.
 */
@Injectable()
export class RepresentationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VERIFACTU_CONNECTOR) private readonly connector: VerifactuConnector,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(REPRESENTATION_OPTIONS) private readonly options: RepresentationOptions,
  ) {}

  /**
   * Registers the issuer at the connector unless it already is. Safe to repeat: the connector
   * treats an issuer it already has as registered. Returns the up-to-date row.
   */
  async ensureIssuerKey(issuerId: string): Promise<IssuerRow> {
    const row = await this.find(issuerId);
    if (row.connectorRegisteredAt) return row;
    const result = await this.connector.createIssuerKey({
      issuerId: row.id,
      taxId: row.taxId,
      name: row.name,
      address: row.address,
      postalCode: row.postalCode,
      municipality: row.municipality,
      province: row.province,
    });
    if (result.outcome === 'transient') return row;
    return this.update(row.id, {
      connectorRegisteredAt: result.outcome === 'ok' ? new Date() : null,
      connectorRejection: result.outcome === 'rejected' ? `${result.code}: ${result.message}` : null,
    });
  }

  /** The Representation as the connector reports it now (or the last state known, if it does not answer). */
  async status(issuerId: string): Promise<Representation> {
    if (!this.options.representationRequired) return this.view(await this.find(issuerId), false);
    const row = await this.ensureIssuerKey(issuerId);
    if (!row.connectorRegisteredAt) return this.view(row, row.connectorRejection === null);
    const result = await this.connector.representationStatus(ref(row));
    if (result.outcome !== 'ok') return this.view(row, true);
    const { state, signingUrl } = result.value;
    return this.view(
      await this.update(row.id, {
        representationState: state,
        representationSigningUrl: signingUrl ?? null,
        representationCheckedAt: new Date(),
      }),
      false,
    );
  }

  /** Whether Emitir is enabled. A signed Representation is trusted without asking the connector again. */
  async canIssue(issuerId: string): Promise<boolean> {
    if (!this.options.representationRequired) return true;
    const row = await this.find(issuerId);
    if (row.representationState === 'signed') return true;
    return (await this.status(issuerId)).canIssue;
  }

  /** Starts the remote signing; the connector emails the link to the signer, who is the signed-in user. */
  async startSigning(issuerId: string, signer: RepresentationSigner, email: string): Promise<Representation> {
    if (!this.options.representationRequired) throw new RepresentationNotRequiredError();
    const current = await this.status(issuerId);
    if (current.state === 'pending' || current.state === 'signed') throw new RepresentationInPlaceError();
    const row = await this.find(issuerId);
    if (!row.connectorRegisteredAt) {
      throw row.connectorRejection ? new ConnectorRejectedError(row.connectorRejection) : new ConnectorUnavailableError();
    }
    const result = await this.connector.startRepresentationSigning(ref(row), { ...signer, email });
    // After a timeout the signing may have started: the next status check tells.
    requireAnswer(result);
    return this.view(
      await this.update(row.id, {
        representationState: 'pending',
        representationSigningUrl: result.value.signingUrl,
        representationSignerEmail: email,
        representationCheckedAt: new Date(),
      }),
      false,
    );
  }

  /** Sends the link of the pending signing again, from Verifiq (starting a new signing has a cost). */
  async resendLink(issuerId: string, fallbackEmail: string): Promise<Representation> {
    const current = await this.status(issuerId);
    if (current.state !== 'pending' || !current.signingUrl) throw new RepresentationNotPendingError();
    const row = await this.find(issuerId);
    await this.mailer.send(representationLinkEmail(row.representationSignerEmail ?? fallbackEmail, current.signingUrl));
    return current;
  }

  private view(row: IssuerRow, stale: boolean): Representation {
    if (!this.options.representationRequired) {
      return { state: 'not-required', error: null, signingUrl: null, stale: false, canIssue: true };
    }
    if (!row.connectorRegisteredAt && row.connectorRejection) {
      return { state: 'error', error: 'issuer-not-accepted', signingUrl: null, stale, canIssue: false };
    }
    const state = (row.representationState ?? 'none') as ConnectorState;
    switch (state) {
      case 'none':
        return { state: 'not-started', error: null, signingUrl: null, stale, canIssue: false };
      case 'pending':
        return { state: 'pending', error: null, signingUrl: row.representationSigningUrl, stale, canIssue: false };
      case 'signed':
        return { state: 'signed', error: null, signingUrl: null, stale, canIssue: true };
      default:
        return { state: 'error', error: ERROR_STATES[state], signingUrl: null, stale, canIssue: false };
    }
  }

  private async find(issuerId: string): Promise<IssuerRow> {
    const [row] = await this.db.select().from(issuers).where(eq(issuers.id, issuerId));
    if (!row) throw new Error(`Issuer ${issuerId} not found`);
    return row;
  }

  private async update(issuerId: string, values: Partial<IssuerRow>): Promise<IssuerRow> {
    const [row] = await this.db
      .update(issuers)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(issuers.id, issuerId))
      .returning();
    return row!;
  }
}

function ref(row: IssuerRow): IssuerRef {
  return { issuerId: row.id, taxId: row.taxId };
}

function requireAnswer<T>(result: ConnectorResult<T>): asserts result is { outcome: 'ok'; value: T } {
  if (result.outcome === 'transient') throw new ConnectorUnavailableError(result.message);
  if (result.outcome === 'rejected') throw new ConnectorRejectedError(result.message);
}
