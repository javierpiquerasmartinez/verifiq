import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { APP_VERSION } from './version.js';

export interface AppOptions {
  databaseUrl: string;
  version: string;
}

@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.forRoot(options.databaseUrl)],
      controllers: [HealthController],
      providers: [{ provide: APP_VERSION, useValue: options.version }],
    };
  }
}
