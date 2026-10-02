import { z } from 'zod';

/** Response of the API health/version endpoint, shared by api and web. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  database: z.literal('up'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
