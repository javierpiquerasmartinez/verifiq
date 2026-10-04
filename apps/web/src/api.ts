import {
  draftSchema,
  draftSummarySchema,
  issuerSummarySchema,
  healthResponseSchema,
  invitationSchema,
  onboardingSchema,
  recipientSchema,
  representationSchema,
  type AcceptInvitation,
  type AcceptTerms,
  type Draft,
  type DraftDataInput,
  type DraftSummary,
  type IssuerDefaults,
  type IssuerSummary,
  type FiscalDataInput,
  type HealthResponse,
  type Invitation,
  type Onboarding,
  type Recipient,
  type RecipientDataInput,
  type RecipientListStatus,
  type Representation,
  type RepresentationSigner,
  type Series,
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

export async function fetchHealth(): Promise<HealthResponse> {
  return healthResponseSchema.parse(await request('/health'));
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

const draftListSchema = draftSummarySchema.array();

/** Most recently edited first. */
export async function fetchDrafts(): Promise<DraftSummary[]> {
  return draftListSchema.parse(await request('/drafts'));
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
