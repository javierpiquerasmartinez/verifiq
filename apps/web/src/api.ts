import {
  catalogItemSchema,
  correctedRecipientSchema,
  draftSchema,
  issuerSummarySchema,
  invitationSchema,
  invoiceIncidentsSchema,
  invoiceListSchema,
  invoiceSchema,
  nextInvoiceNumberSchema,
  onboardingSchema,
  recipientSchema,
  representationSchema,
  voidedInvoiceSchema,
  type AcceptInvitation,
  type AcceptTerms,
  type CatalogItem,
  type CatalogItemDataInput,
  type CorrectedRecipient,
  type Draft,
  type DraftDataInput,
  type IssuerDefaults,
  type IssuerSummary,
  type FiscalDataInput,
  type Invitation,
  type Invoice,
  type InvoiceIncident,
  type InvoiceResubmission,
  type WithholdingCorrection,
  type InvoiceList,
  type InvoiceListQuery,
  type InvoiceVoidingInput,
  type NewCorrectiveDraftInput,
  type Onboarding,
  type Recipient,
  type RecipientCorrection,
  type RecipientDataInput,
  type RecipientListStatus,
  type Representation,
  type RepresentationSigner,
  type Series,
  type VoidedInvoice,
} from '@verifiq/domain';

/** Base URL of the API: `/api` behind the same-origin proxy (Vercel rewrite, Vite dev server). */
export const apiUrl = import.meta.env.VITE_API_URL;

/** An API error with the stable code from the response body, when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    /** The whole response body, for errors that carry more than a code. */
    readonly body?: unknown,
  ) {
    super(`API responded with ${status}${code ? ` (${code})` : ''}`);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const code = (body as { code?: unknown } | undefined)?.code;
    throw new ApiError(response.status, typeof code === 'string' ? code : undefined, body);
  }
  return body;
}

export async function fetchInvitation(token: string): Promise<Invitation> {
  return invitationSchema.parse(await request(`/invitations/${encodeURIComponent(token)}`));
}

export async function acceptInvitation(token: string, body: AcceptInvitation): Promise<void> {
  await request(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const sendJson = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export async function fetchOnboarding(): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding'));
}

export async function saveFiscalData(body: FiscalDataInput): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/fiscal-data', sendJson('PUT', body)));
}

export async function saveDefaults(body: IssuerDefaults): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/defaults', sendJson('PUT', body)));
}

export async function confirmSeries(body: Series): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/series', sendJson('POST', body)));
}

export async function acceptTerms(body: AcceptTerms): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/terms', sendJson('POST', body)));
}

export async function fetchIssuer(): Promise<IssuerSummary> {
  return issuerSummarySchema.parse(await request('/issuer'));
}

/** Served to the signed-in user only; `version` busts the browser cache after a change. */
export const logoUrl = (version: number) => `${apiUrl}/issuer/logo?v=${version}`;

export async function uploadLogo(file: File): Promise<void> {
  await request('/issuer/logo', { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
}

export async function removeLogo(): Promise<void> {
  await request('/issuer/logo', { method: 'DELETE' });
}

/** Asks the connector for the current state: the web polls it while a signing is pending. */
export async function fetchRepresentation(): Promise<Representation> {
  return representationSchema.parse(await request('/issuer/representation'));
}

export async function startRepresentationSigning(body: RepresentationSigner): Promise<Representation> {
  return representationSchema.parse(await request('/issuer/representation/signing', sendJson('POST', body)));
}

export async function resendRepresentationLink(): Promise<Representation> {
  return representationSchema.parse(await request('/issuer/representation/resend', { method: 'POST' }));
}

const recipientListSchema = recipientSchema.array();

export async function fetchRecipients(query: { q: string; status: RecipientListStatus }): Promise<Recipient[]> {
  const search = new URLSearchParams(query);
  return recipientListSchema.parse(await request(`/recipients?${search}`));
}

export async function fetchRecipient(id: string): Promise<Recipient> {
  return recipientSchema.parse(await request(`/recipients/${encodeURIComponent(id)}`));
}

/** Checks the tax ID against the AEAT census: it fails with the census verdict when it is not there. */
export async function createRecipient(body: RecipientDataInput): Promise<Recipient> {
  return recipientSchema.parse(await request('/recipients', sendJson('POST', body)));
}

export async function updateRecipient(id: string, body: RecipientDataInput): Promise<Recipient> {
  return recipientSchema.parse(await request(`/recipients/${encodeURIComponent(id)}`, sendJson('PUT', body)));
}

/** Only for a recipient without issued invoices; the others are archived. */
export async function deleteRecipient(id: string): Promise<void> {
  await request(`/recipients/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setRecipientArchived(id: string, archived: boolean): Promise<Recipient> {
  const action = archived ? 'archive' : 'restore';
  return recipientSchema.parse(await request(`/recipients/${encodeURIComponent(id)}/${action}`, { method: 'POST' }));
}

/** The api computes the amounts and the problems that still keep it from being issued. */
export async function fetchDraft(id: string): Promise<Draft> {
  return draftSchema.parse(await request(`/drafts/${encodeURIComponent(id)}`));
}

export async function createDraft(body: DraftDataInput): Promise<Draft> {
  return draftSchema.parse(await request('/drafts', sendJson('POST', body)));
}

export async function updateDraft(id: string, body: DraftDataInput): Promise<Draft> {
  return draftSchema.parse(await request(`/drafts/${encodeURIComponent(id)}`, sendJson('PUT', body)));
}

export async function deleteDraft(id: string): Promise<void> {
  await request(`/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const catalogItemListSchema = catalogItemSchema.array();

/** Sorted by name. */
export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  return catalogItemListSchema.parse(await request('/catalog-items'));
}

export async function fetchCatalogItem(id: string): Promise<CatalogItem> {
  return catalogItemSchema.parse(await request(`/catalog-items/${encodeURIComponent(id)}`));
}

export async function createCatalogItem(body: CatalogItemDataInput): Promise<CatalogItem> {
  return catalogItemSchema.parse(await request('/catalog-items', sendJson('POST', body)));
}

export async function updateCatalogItem(id: string, body: CatalogItemDataInput): Promise<CatalogItem> {
  return catalogItemSchema.parse(await request(`/catalog-items/${encodeURIComponent(id)}`, sendJson('PUT', body)));
}

/** Lines copied from it keep their values. */
export async function deleteCatalogItem(id: string): Promise<void> {
  await request(`/catalog-items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Issues the draft (irreversible): it gets its number and becomes the invoice; its record is sent to the AEAT. */
export async function issueInvoice(draftId: string): Promise<Invoice> {
  return invoiceSchema.parse(await request('/invoices', sendJson('POST', { draftId })));
}

/**
 * Corrects the copy of an invoice whose record has an incident and sends its record again, with the
 * same number. The recipient's data come again from its profile.
 */
export async function resubmitInvoice(id: string, body: InvoiceResubmission): Promise<Invoice> {
  return invoiceSchema.parse(await request(`/invoices/${encodeURIComponent(id)}/resubmission`, sendJson('POST', body)));
}

/** Rectifying the invoice: a corrective draft by differences, to review and issue like any draft. */
export async function startCorrection(invoiceId: string, body: NewCorrectiveDraftInput): Promise<Draft> {
  return draftSchema.parse(await request(`/invoices/${encodeURIComponent(invoiceId)}/corrective-draft`, sendJson('POST', body)));
}

/** "Corregir retención": the right IRPF withholding, with the same number and record; its PDF gets a new version. */
export async function correctWithholding(invoiceId: string, body: WithholdingCorrection): Promise<Invoice> {
  return invoiceSchema.parse(
    await request(`/invoices/${encodeURIComponent(invoiceId)}/withholding-correction`, sendJson('POST', body)),
  );
}

/**
 * Voids the invoice (irreversible: its number is never reused), or sends its Voiding again. With
 * `reissue`, also a new draft with its content.
 */
export async function voidInvoice(invoiceId: string, body: InvoiceVoidingInput = {}): Promise<VoidedInvoice> {
  return voidedInvoiceSchema.parse(await request(`/invoices/${encodeURIComponent(invoiceId)}/voiding`, sendJson('POST', body)));
}

/** "Corregir destinatario": voids the invoice (not sent) or rectifies it totally (sent), and gives a new draft without recipient. */
export async function correctRecipient(invoiceId: string, body: RecipientCorrection): Promise<CorrectedRecipient> {
  return correctedRecipientSchema.parse(
    await request(`/invoices/${encodeURIComponent(invoiceId)}/recipient-correction`, sendJson('POST', body)),
  );
}

/** A page of drafts and invoices, newest first, with how many match under each filter. */
export async function fetchInvoiceList(query: InvoiceListQuery): Promise<InvoiceList> {
  const search = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  );
  return invoiceListSchema.parse(await request(`/invoices?${search}`));
}

/** The invoices whose record needs the user, the longest waiting first. */
export async function fetchInvoiceIncidents(): Promise<InvoiceIncident[]> {
  return invoiceIncidentsSchema.parse(await request('/invoices/incidents'));
}

export async function fetchInvoice(id: string): Promise<Invoice> {
  return invoiceSchema.parse(await request(`/invoices/${encodeURIComponent(id)}`));
}

/**
 * The stored PDF of the invoice, served to the signed-in user only: its current version, or an earlier
 * `version`; shown in the browser, or saved with `download`.
 */
export function invoicePdfUrl(id: string, { download = false, version }: { download?: boolean; version?: number } = {}): string {
  const query = new URLSearchParams();
  if (version !== undefined) query.set('version', String(version));
  if (download) query.set('download', '');
  const search = query.toString();
  return `${apiUrl}/invoices/${encodeURIComponent(id)}/pdf${search && `?${search}`}`;
}

/** The number the next Issuance in the series assigns, unless another one comes first. */
export async function fetchNextInvoiceNumber(series: 'ordinary' | 'corrective' = 'ordinary'): Promise<string> {
  return nextInvoiceNumberSchema.parse(await request(`/invoices/next-number?series=${series}`)).number;
}
