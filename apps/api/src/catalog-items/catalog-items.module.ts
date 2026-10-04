import { Module } from '@nestjs/common';
import { CatalogItemsController } from './catalog-items.controller.js';
import { CatalogItemsService } from './catalog-items.js';

/** The issuer's catalog items: reusable line concepts. */
@Module({
  controllers: [CatalogItemsController],
  providers: [CatalogItemsService],
})
export class CatalogItemsModule {}
