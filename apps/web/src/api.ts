import { healthResponseSchema, type HealthResponse } from '@verifiq/domain';

const apiUrl = import.meta.env.VITE_API_URL;

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) throw new Error(`API responded with ${response.status}`);
  return healthResponseSchema.parse(await response.json());
}
