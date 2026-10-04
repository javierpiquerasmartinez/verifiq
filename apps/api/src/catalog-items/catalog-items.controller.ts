import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { CatalogItemErrorCode, catalogItemDataSchema, type CatalogItem } from '@verifiq/domain';
import { z } from 'zod';
import { parseBody, withHttpErrors } from '../issuers/http.js';
import { CurrentIssuer } from '../issuers/issuer-context.js';
import { CatalogItemNotFoundError, CatalogItemsService } from './catalog-items.js';

const notFound = () =>
  new NotFoundException({ code: CatalogItemErrorCode.NotFound, message: 'Catalog item not found' });

const run = <T>(work: Promise<T>) =>
  withHttpErrors(work, (error) => (error instanceof CatalogItemNotFoundError ? notFound() : error));

/** Anything that is not a uuid is no catalog item. */
function catalogItemId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}

/** The issuer's catalog items ("Artículos" in the web). Reachable before the Representation is signed. */
@Controller('catalog-items')
export class CatalogItemsController {
  constructor(private readonly catalogItems: CatalogItemsService) {}

  @Get()
  list(@CurrentIssuer() issuerId: string): Promise<CatalogItem[]> {
    return this.catalogItems.list(issuerId);
  }

  @Post()
  create(@CurrentIssuer() issuerId: string, @Body() body: unknown): Promise<CatalogItem> {
    return run(this.catalogItems.create(issuerId, parseBody(catalogItemDataSchema, body)));
  }

  @Get(':id')
  show(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<CatalogItem> {
    return run(this.catalogItems.find(issuerId, catalogItemId(id)));
  }

  @Put(':id')
  update(@CurrentIssuer() issuerId: string, @Param('id') id: string, @Body() body: unknown): Promise<CatalogItem> {
    const data = parseBody(catalogItemDataSchema, body);
    return run(this.catalogItems.update(issuerId, catalogItemId(id), data));
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<void> {
    return run(this.catalogItems.delete(issuerId, catalogItemId(id)));
  }
}
