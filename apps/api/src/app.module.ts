import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import type { AuthOptions } from './auth/auth.js';
import { DatabaseModule } from './database/database.module.js';
import { EmisoresModule } from './emisores/emisores.module.js';
import { HealthController } from './health/health.controller.js';
import { InvitationsController } from './invitations/invitations.controller.js';
import type { Mailer } from './mail/mailer.js';
import type { ObjectStorage } from './storage/object-storage.js';
import { APP_VERSION } from './version.js';

export interface AppOptions {
  databaseUrl: string;
  version: string;
  auth: AuthOptions;
  mailer: Mailer;
  storage: ObjectStorage;
}

@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.forRoot(options.databaseUrl),
        AuthModule.forRoot(options.auth, options.mailer),
        EmisoresModule.forRoot(options.storage),
      ],
      controllers: [HealthController, InvitationsController],
      providers: [{ provide: APP_VERSION, useValue: options.version }],
    };
  }
}
