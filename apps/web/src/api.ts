import {
  healthResponseSchema,
  invitationSchema,
  meSchema,
  type AcceptInvitation,
  type HealthResponse,
  type Invitation,
  type Me,
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

export async function fetchMe(): Promise<Me> {
  return meSchema.parse(await request('/me'));
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
