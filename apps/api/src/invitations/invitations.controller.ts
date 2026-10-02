import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  GoneException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import {
  AuthErrorCode,
  acceptInvitationSchema,
  type Invitation,
} from '@verifiq/domain';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { AUTH, type Auth } from '../auth/auth.js';
import { Public } from '../auth/session.guard.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  claimInvitation,
  findInvitation,
  linkInvitationToUser,
  releaseInvitation,
  type InvitationProblem,
} from './invitations.js';

const PROBLEM_MESSAGES: Record<InvitationProblem, string> = {
  [AuthErrorCode.InvitationNotFound]: 'This invitation does not exist',
  [AuthErrorCode.InvitationExpired]: 'This invitation has expired',
  [AuthErrorCode.InvitationUsed]: 'This invitation has already been used',
};

function invitationError(problem: InvitationProblem) {
  const body = { code: problem, message: PROBLEM_MESSAGES[problem] };
  return problem === AuthErrorCode.InvitationNotFound
    ? new NotFoundException(body)
    : new GoneException(body);
}

@Public()
@Controller('invitations')
export class InvitationsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  @Get(':token')
  async show(@Param('token') token: string): Promise<Invitation> {
    const invitation = await findInvitation(this.db, token);
    if (!invitation.ok) throw invitationError(invitation.problem);
    return { email: invitation.email };
  }

  /** Creates the Usuario with its password and signs it in; the next step is setting up 2FA. */
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Invitation> {
    const parsed = acceptInvitationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', issues: parsed.error.issues });
    }
    const { name, password } = parsed.data;

    const invitation = await claimInvitation(this.db, token);
    if (!invitation.ok) throw invitationError(invitation.problem);
    const { email } = invitation;

    const ctx = await this.auth.$context;
    try {
      if (await ctx.internalAdapter.findUserByEmail(email)) {
        throw new ConflictException({
          code: AuthErrorCode.EmailTaken,
          message: 'There is already an account with this email',
        });
      }
      const user = await ctx.internalAdapter.createUser(
        { email, name, emailVerified: true },
        { method: 'email-password' },
      );
      await ctx.internalAdapter.linkAccount({
        userId: user.id,
        providerId: 'credential',
        accountId: user.id,
        password: await ctx.password.hash(password),
      });
      await linkInvitationToUser(this.db, invitation.id, user.id);
    } catch (error) {
      await releaseInvitation(this.db, invitation.id);
      throw error;
    }

    const { headers } = await this.auth.api.signInEmail({
      body: { email, password },
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    response.append('Set-Cookie', headers.getSetCookie());
    return { email };
  }
}
