import { Module, type DynamicModule } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';

/** Provides the object storage port (logos, invoice PDFs) to every module. */
@Module({})
export class StorageModule {
  static forRoot(storage: ObjectStorage): DynamicModule {
    return {
      module: StorageModule,
      global: true,
      providers: [{ provide: OBJECT_STORAGE, useValue: storage }],
      exports: [OBJECT_STORAGE],
    };
  }
}
