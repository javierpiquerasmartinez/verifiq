import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import type { AuthOptions } from './auth/auth.js';
import { CatalogItemsModule } from './catalog-items/catalog-items.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DraftsModule } from './drafts/drafts.module.js';
import { IssuersModule } from './issuers/issuers.module.js';
import { HealthController } from './health/health.controller.js';
import { InvitationsController } from './invitations/invitations.controller.js';
import { InvoicesModule, SubmissionModule } from './invoices/invoices.module.js';
import type { Mailer } from './mail/mailer.js';
import { RecipientsModule } from './recipients/recipients.module.js';
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
  /** The outbox of InvoiceRecords; the worker service sends them, unless `work` has this process do it. */
  submission: { queueName: string; work: boolean };
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
        RecipientsModule,
        DraftsModule,
        CatalogItemsModule,
        SubmissionModule.forRoot({ databaseUrl: options.databaseUrl, ...options.submission }),
        InvoicesModule,
      ],
      controllers: [HealthController, InvitationsController],
      providers: [{ provide: APP_VERSION, useValue: options.version }],
    };
  }
}
