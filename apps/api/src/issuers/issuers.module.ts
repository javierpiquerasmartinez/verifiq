import { Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { IssuerController } from './issuer.controller.js';
import { OnboardingController } from './onboarding.controller.js';
import { IssuerContextInterceptor } from './issuer-context.js';

/** The issuer, its onboarding, and the isolation layer every business module relies on. */
@Module({})
export class IssuersModule {
  static forRoot(storage: ObjectStorage): DynamicModule {
    return {
      module: IssuersModule,
      global: true,
      controllers: [OnboardingController, IssuerController],
      providers: [
        { provide: OBJECT_STORAGE, useValue: storage },
        { provide: APP_INTERCEPTOR, useClass: IssuerContextInterceptor },
      ],
      exports: [OBJECT_STORAGE],
    };
  }
}
