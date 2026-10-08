import { Module, type DynamicModule } from '@nestjs/common';
import { OperatorController } from './operator.controller.js';
import { OPERATOR_OPTIONS, type OperatorOptions } from './operator.options.js';
import { OperatorPanelService } from './operator-panel.js';

/** The operator's panel (spec, stories 1 and 91–93). Only the operator role reaches it. */
@Module({})
export class OperatorModule {
  static forRoot(options: OperatorOptions): DynamicModule {
    return {
      module: OperatorModule,
      controllers: [OperatorController],
      providers: [{ provide: OPERATOR_OPTIONS, useValue: options }, OperatorPanelService],
    };
  }
}
