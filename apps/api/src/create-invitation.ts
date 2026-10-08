import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import { invitationEmail } from './auth/emails.js';
import { loadEnv } from './config.js';
import * as schema from './database/schema.js';
import { createInvitation, invitationUrl } from './invitations/invitations.js';
import { mailerFromEnv } from './mail/from-env.js';

// Operator script: pnpm invite <email> [--operator]. Prints the link and emails it to the invited user.
// Users are usually invited from the operator's panel; the operator's own account is invited from here.
const args = process.argv.slice(2);
const role = args.includes('--operator') ? 'operator' : 'user';
const email = z.email().parse(args.find((arg) => !arg.startsWith('--')));
const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  const { token, invitation } = await createInvitation(drizzle({ client: pool, schema }), { email, role });
  const url = invitationUrl(env.APP_URL, token);
  const expiresAt = new Date(invitation.expiresAt);
  await mailerFromEnv(env).send(invitationEmail(email, url, expiresAt));
  console.log(`${role === 'operator' ? 'Operator invitation' : 'Invitation'} for ${email} (expires ${invitation.expiresAt}):\n${url}`);
} finally {
  await pool.end();
}
