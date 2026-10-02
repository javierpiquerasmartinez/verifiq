import { Controller, Get, Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Me } from '@verifiq/domain';
import { DATABASE, type Database } from '../database/database.module.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { AUTH, createAuth, type AuthOptions } from './auth.js';
import { CurrentSession, SessionGuard, type AuthSession } from './session.guard.js';

@Controller('me')
class MeController {
  @Get()
  me(@CurrentSession() { user }: AuthSession): Me {
    return { id: user.id, email: user.email, name: user.name };
  }
}

/** Better Auth (mounted on /auth by configureHttp) and the global session guard. */
@Module({})
export class AuthModule {
  static forRoot(options: AuthOptions, mailer: Mailer): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      controllers: [MeController],
      providers: [
        { provide: MAILER, useValue: mailer },
        {
          provide: AUTH,
          inject: [DATABASE],
          useFactory: (db: Database) => createAuth(db, mailer, options),
        },
        { provide: APP_GUARD, useClass: SessionGuard },
      ],
      exports: [AUTH, MAILER],
    };
  }
}
