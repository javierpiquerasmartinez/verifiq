import type { OperatorInvitation, OperatorIssuer, RecordAlert, RecordAlertKind } from '@verifiq/domain';

/** The alerts of one issuer for one problem: how many records, and since when the oldest waits. */
export type AlertGroup = {
  issuer: RecordAlert['issuer'];
  kind: RecordAlertKind;
  since: string;
  records: Pick<RecordAlert, 'invoiceNumber' | 'errorCode'>[];
};

/** One row per issuer and problem, the longest waiting first. */
export function alertGroups(alerts: RecordAlert[]): AlertGroup[] {
  const groups = new Map<string, AlertGroup>();
  for (const alert of [...alerts].sort((a, b) => a.since.localeCompare(b.since))) {
    const key = `${alert.issuer.id}:${alert.kind}`;
    const group = groups.get(key) ?? { issuer: alert.issuer, kind: alert.kind, since: alert.since, records: [] };
    group.records.push({ invoiceNumber: alert.invoiceNumber, errorCode: alert.errorCode });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export type PanelRow =
  | { type: 'issuer'; issuer: OperatorIssuer }
  | { type: 'invitation'; invitation: OperatorInvitation };

/** Accepted invitations are already issuers, and revoked ones are done with. */
const WAITING_INVITATIONS: ReadonlySet<OperatorInvitation['status']> = new Set(['pending', 'expired']);

const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/**
 * The issuers, then the invitations still waiting to become one; those matching `query` by the
 * issuer's name or NIF, or the invitation's email.
 */
export function panelRows(issuers: OperatorIssuer[], invitations: OperatorInvitation[], query: string): PanelRow[] {
  const wanted = normalized(query);
  const matches = (...texts: string[]) => texts.some((text) => normalized(text).includes(wanted));
  return [
    ...issuers.filter((issuer) => matches(issuer.name, issuer.taxId)).map((issuer) => ({ type: 'issuer' as const, issuer })),
    ...invitations
      .filter((invitation) => WAITING_INVITATIONS.has(invitation.status) && matches(invitation.email))
      .map((invitation) => ({ type: 'invitation' as const, invitation })),
  ];
}
