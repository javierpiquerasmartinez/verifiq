import { Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { EmisorController } from './emisor.controller.js';
import { OnboardingController } from './onboarding.controller.js';
import { EmisorContextInterceptor } from './tenancy.js';

/** The Emisor, its alta, and the isolation layer every business module relies on. */
@Module({})
export class EmisoresModule {
  static forRoot(storage: ObjectStorage): DynamicModule {
    return {
      module: EmisoresModule,
      global: true,
      controllers: [OnboardingController, EmisorController],
      providers: [
        { provide: OBJECT_STORAGE, useValue: storage },
        { provide: APP_INTERCEPTOR, useClass: EmisorContextInterceptor },
      ],
      exports: [OBJECT_STORAGE],
    };
  }
}
