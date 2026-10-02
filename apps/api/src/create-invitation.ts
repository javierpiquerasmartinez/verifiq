import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import { invitationEmail } from './auth/emails.js';
import { loadEnv } from './config.js';
import * as schema from './database/schema.js';
import { createInvitation } from './invitations/invitations.js';
import { mailerFromEnv } from './mail/from-env.js';

// Operator script: pnpm invite <email>. Prints the link and emails it to the invited Usuario.
const email = z.email().parse(process.argv[2]);
const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  const { token, expiresAt } = await createInvitation(drizzle({ client: pool, schema }), { email });
  const url = new URL(`/invitacion/${token}`, env.APP_URL).toString();
  await mailerFromEnv(env).send(invitationEmail(email, url, expiresAt));
  console.log(`Invitation for ${email} (expires ${expiresAt.toISOString()}):\n${url}`);
} finally {
  await pool.end();
}
