import { Module, type DynamicModule } from '@nestjs/common';
import { DATABASE, type Database } from '../database/database.module.js';
import { VERIFACTU_CONNECTOR } from './connector.js';
import type { VerifactuConnectorFactory } from './from-env.js';

/** Provides the VeriFactu connector port (ADR 0001) to every module. */
@Module({})
export class VerifactuModule {
  static forRoot(connector: VerifactuConnectorFactory): DynamicModule {
    return {
      module: VerifactuModule,
      global: true,
      providers: [{ provide: VERIFACTU_CONNECTOR, useFactory: (db: Database) => connector(db), inject: [DATABASE] }],
      exports: [VERIFACTU_CONNECTOR],
    };
  }
}
