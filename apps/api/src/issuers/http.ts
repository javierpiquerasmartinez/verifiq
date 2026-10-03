import { BadRequestException, ConflictException } from '@nestjs/common';
import { IssuerErrorCode } from '@verifiq/domain';
import type { z } from 'zod';

// HTTP helpers shared by the issuer controllers.

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: IssuerErrorCode.ValidationFailed,
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

export const conflict = (code: IssuerErrorCode, message: string) => new ConflictException({ code, message });

/** Runs `work`, turning the errors `toHttp` knows into HTTP errors. */
export async function withHttpErrors<T>(work: Promise<T>, toHttp: (error: unknown) => unknown): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw toHttp(error);
  }
}
