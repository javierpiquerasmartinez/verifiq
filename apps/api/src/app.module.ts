import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import type { AuthOptions } from './auth/auth.js';
import { DatabaseModule } from './database/database.module.js';
import { IssuersModule } from './issuers/issuers.module.js';
import { HealthController } from './health/health.controller.js';
import { InvitationsController } from './invitations/invitations.controller.js';
import type { Mailer } from './mail/mailer.js';
import type { ObjectStorage } from './storage/object-storage.js';
import type { VerifactuConnectorFactory } from './verifactu/from-env.js';
import { VerifactuModule } from './verifactu/verifactu.module.js';
import { APP_VERSION } from './version.js';

export interface AppOptions {
  databaseUrl: string;
  version: string;
  auth: AuthOptions;
  mailer: Mailer;
  storage: ObjectStorage;
  verifactu: VerifactuConnectorFactory;
  /** Whether issuers must sign the Representation to issue. The AEAT test environment needs none. */
  representationRequired: boolean;
}

@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.forRoot(options.databaseUrl),
        AuthModule.forRoot(options.auth, options.mailer),
        IssuersModule.forRoot(options.storage, { representationRequired: options.representationRequired }),
        VerifactuModule.forRoot(options.verifactu),
      ],
      controllers: [HealthController, InvitationsController],
      providers: [{ provide: APP_VERSION, useValue: options.version }],
    };
  }
}
