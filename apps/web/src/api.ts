import {
  emisorSummarySchema,
  healthResponseSchema,
  invitationSchema,
  onboardingSchema,
  type AcceptInvitation,
  type AcceptTerms,
  type EmisorDefaults,
  type EmisorSummary,
  type FiscalDataInput,
  type HealthResponse,
  type Invitation,
  type Onboarding,
  type Series,
} from '@verifiq/domain';

/** Base URL of the API: `/api` behind the same-origin proxy (Vercel rewrite, Vite dev server). */
export const apiUrl = import.meta.env.VITE_API_URL;

/** An API error with the stable code from the response body, when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
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
    throw new ApiError(response.status, typeof code === 'string' ? code : undefined);
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

export async function saveDefaults(body: EmisorDefaults): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/defaults', sendJson('PUT', body)));
}

export async function confirmSeries(body: Series): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/serie', sendJson('POST', body)));
}

export async function acceptTerms(body: AcceptTerms): Promise<Onboarding> {
  return onboardingSchema.parse(await request('/onboarding/terms', sendJson('POST', body)));
}

export async function fetchEmisor(): Promise<EmisorSummary> {
  return emisorSummarySchema.parse(await request('/emisor'));
}

/** Served to the signed-in Usuario only; `version` busts the browser cache after a change. */
export const logoUrl = (version: number) => `${apiUrl}/emisor/logo?v=${version}`;

export async function uploadLogo(file: File): Promise<void> {
  await request('/emisor/logo', { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
}

export async function removeLogo(): Promise<void> {
  await request('/emisor/logo', { method: 'DELETE' });
}
