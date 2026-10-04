import { Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IssuerController } from './issuer.controller.js';
import { OnboardingController } from './onboarding.controller.js';
import { IssuerContextInterceptor } from './issuer-context.js';
import { RepresentationController } from './representation.controller.js';
import {
  REPRESENTATION_OPTIONS,
  RepresentationService,
  type RepresentationOptions,
} from './representation.js';

/** The issuer, its onboarding (Representation included), and the isolation layer every business module relies on. */
@Module({})
export class IssuersModule {
  static forRoot(representation: RepresentationOptions): DynamicModule {
    return {
      module: IssuersModule,
      global: true,
      controllers: [OnboardingController, IssuerController, RepresentationController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: IssuerContextInterceptor },
        { provide: REPRESENTATION_OPTIONS, useValue: representation },
        RepresentationService,
      ],
      exports: [RepresentationService],
    };
  }
}
