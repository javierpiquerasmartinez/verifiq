import { Module, type DynamicModule } from '@nestjs/common';
import { MAILER, type Mailer } from './mailer.js';

/** Provides the mailer to every module, in the API and in the worker. */
@Module({})
export class MailModule {
  static forRoot(mailer: Mailer): DynamicModule {
    return {
      module: MailModule,
      global: true,
      providers: [{ provide: MAILER, useValue: mailer }],
      exports: [MAILER],
    };
  }
}
