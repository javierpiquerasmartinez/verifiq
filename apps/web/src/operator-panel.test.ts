import type { OperatorInvitation, OperatorIssuer, RecordAlert } from '@verifiq/domain';
import { describe, expect, it } from 'vitest';
import { alertGroups, panelRows } from './operator-panel';

const lucia = { id: '00000000-0000-4000-8000-000000000001', name: 'Lucía Ferrer Albiol', taxId: '24387612K' };
const marc = { id: '00000000-0000-4000-8000-000000000002', name: 'Marc Soler Puig', taxId: '12345678Z' };

const alert = (overrides: Partial<RecordAlert>): RecordAlert => ({
  invoiceRecordId: crypto.randomUUID(),
  kind: 'rejected',
  issuer: lucia,
  invoiceNumber: 'F2026-0001',
  since: '2026-10-01T09:15:00.000Z',
  errorCode: null,
  ...overrides,
});

describe('alertGroups', () => {
  it('groups the alerts of an issuer by kind, from the longest waiting', () => {
    const groups = alertGroups([
      alert({ kind: 'unconfirmed', issuer: marc, invoiceNumber: 'F2026-0003', since: '2026-09-30T17:02:00.000Z' }),
      alert({ kind: 'rejected', invoiceNumber: 'F2026-0014', since: '2026-10-01T09:15:00.000Z', errorCode: '1100' }),
      alert({ kind: 'unconfirmed', issuer: marc, invoiceNumber: 'F2026-0004', since: '2026-10-01T10:00:00.000Z' }),
      alert({ kind: 'blocked', issuer: marc, invoiceNumber: 'F2026-0005', since: '2026-10-02T08:40:00.000Z' }),
    ]);

    expect(groups).toEqual([
      {
        issuer: marc,
        kind: 'unconfirmed',
        since: '2026-09-30T17:02:00.000Z',
        records: [
          { invoiceNumber: 'F2026-0003', errorCode: null },
          { invoiceNumber: 'F2026-0004', errorCode: null },
        ],
      },
      {
        issuer: lucia,
        kind: 'rejected',
        since: '2026-10-01T09:15:00.000Z',
        records: [{ invoiceNumber: 'F2026-0014', errorCode: '1100' }],
      },
      {
        issuer: marc,
        kind: 'blocked',
        since: '2026-10-02T08:40:00.000Z',
        records: [{ invoiceNumber: 'F2026-0005', errorCode: null }],
      },
    ]);
  });
});

const issuer = (overrides: Partial<OperatorIssuer>): OperatorIssuer => ({
  ...lucia,
  onboardingCompletedAt: '2026-07-14T10:00:00.000Z',
  representation: { state: 'signed', error: null },
  invoiceCount: 24,
  openIncidents: 0,
  ...overrides,
});

const invitation = (overrides: Partial<OperatorInvitation>): OperatorInvitation => ({
  id: crypto.randomUUID(),
  email: 'nombre@dominio.es',
  status: 'pending',
  createdAt: '2026-10-01T09:00:00.000Z',
  expiresAt: '2026-10-08T09:00:00.000Z',
  ...overrides,
});

describe('panelRows', () => {
  it('lists the issuers, then the invitations still waiting to be accepted', () => {
    const pending = invitation({ status: 'pending' });
    const expired = invitation({ email: 'caducada@dominio.es', status: 'expired' });

    const rows = panelRows(
      [issuer({}), issuer(marc)],
      [pending, invitation({ status: 'accepted' }), invitation({ status: 'revoked' }), expired],
      '',
    );

    expect(rows.map((row) => (row.type === 'issuer' ? row.issuer.name : row.invitation.email))).toEqual([
      'Lucía Ferrer Albiol',
      'Marc Soler Puig',
      'nombre@dominio.es',
      'caducada@dominio.es',
    ]);
  });

  it('finds issuers by name or NIF and invitations by email, ignoring case and accents', () => {
    const issuers = [issuer({}), issuer(marc)];
    const invitations = [invitation({ email: 'marc@dominio.es' })];
    const found = (query: string) =>
      panelRows(issuers, invitations, query).map((row) =>
        row.type === 'issuer' ? row.issuer.name : row.invitation.email,
      );

    expect(found('lucia')).toEqual(['Lucía Ferrer Albiol']);
    expect(found(' 12345678z ')).toEqual(['Marc Soler Puig']);
    expect(found('marc@')).toEqual(['marc@dominio.es']);
    expect(found('nadie')).toEqual([]);
  });
});
