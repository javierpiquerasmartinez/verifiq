import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthErrorCode,
  invitationListQuerySchema,
  newInvitationSchema,
  type InvitationList,
  type CreatedInvitation,
  type OperatorInvitation,
  type OperatorIssuer,
  type RecordAlert,
} from '@verifiq/domain';
import { z } from 'zod';
import { OperatorOnly } from '../auth/session.guard.js';
import { parseBody } from '../issuers/http.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  INVITATION_PROBLEM_MESSAGES,
  InvitationUsedError,
  inviteByEmail,
  revokeInvitation,
} from '../invitations/invitations.js';
import { decodeInvitationCursor, listInvitations } from '../invitations/invitation-list.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { OPERATOR_OPTIONS, type OperatorOptions } from './operator.options.js';
import { OperatorPanelService } from './operator-panel.js';

const invitationNotFound = () =>
  new NotFoundException({
    code: AuthErrorCode.InvitationNotFound,
    message: INVITATION_PROBLEM_MESSAGES[AuthErrorCode.InvitationNotFound],
  });

const listQuerySchema = invitationListQuerySchema.transform(({ cursor, ...query }, context) => {
  const decoded = cursor === undefined ? null : decodeInvitationCursor(cursor, query.sort);
  if (cursor !== undefined && decoded === null) {
    context.addIssue({ code: 'custom', path: ['cursor'], message: 'Not a cursor of this list' });
    return z.NEVER;
  }
  return { ...query, cursor: decoded };
});

/** The operator's panel: invitations and the operational health of every issuer. */
@OperatorOnly()
@Controller('operator')
export class OperatorController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(OPERATOR_OPTIONS) private readonly options: OperatorOptions,
    private readonly panel: OperatorPanelService,
  ) {}

  @Get('issuers')
  issuers(): Promise<OperatorIssuer[]> {
    return this.panel.issuers();
  }

  @Get('alerts')
  alerts(): Promise<RecordAlert[]> {
    return this.panel.alerts();
  }

  /** Every user's invitation, searched, filtered, sorted and paged. */
  @Get('invitations')
  invitations(@Query() query: unknown): Promise<InvitationList> {
    return listInvitations(this.db, parseBody(listQuerySchema, query));
  }

  /** Invites a user: emails the link, and returns it this once for the operator to pass on. */
  @Post('invitations')
  async invite(@Body() body: unknown): Promise<CreatedInvitation> {
    const parsed = newInvitationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: AuthErrorCode.ValidationFailed, issues: parsed.error.issues });
    }
    const { url, invitation } = await inviteByEmail(this.db, this.mailer, {
      appUrl: this.options.appUrl,
      email: parsed.data.email,
    });
    return { ...invitation, url };
  }

  @Post('invitations/:id/revoke')
  @HttpCode(200)
  async revoke(@Param('id') id: string): Promise<OperatorInvitation> {
    if (!z.uuid().safeParse(id).success) throw invitationNotFound();
    try {
      const revoked = await revokeInvitation(this.db, id);
      if (!revoked) throw invitationNotFound();
      return revoked;
    } catch (error) {
      if (error instanceof InvitationUsedError) {
        throw new ConflictException({
          code: AuthErrorCode.InvitationUsed,
          message: INVITATION_PROBLEM_MESSAGES[AuthErrorCode.InvitationUsed],
        });
      }
      throw error;
    }
  }
}
