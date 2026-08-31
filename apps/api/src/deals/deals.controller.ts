import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import { DealsService } from './deals.service';
import { DocumentsService } from './documents.service';

// PATCHable facts only — reference, timestamps and relations stay server-owned.
const DealUpdateSchema = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.number().int().min(1980).max(2035).nullable().optional(),
  colour: z.string().max(40).nullable().optional(),
  registrationNo: z.string().max(20).nullable().optional(),
  vin: z.string().max(30).nullable().optional(),
  mileageKm: z.number().int().min(0).nullable().optional(),
  supplier: z.string().max(80).nullable().optional(),
  sourceCountry: z.string().max(60).nullable().optional(),
  destinationCountry: z.string().max(60).nullable().optional(),
  destinationCity: z.string().max(60).nullable().optional(),
  sellingPrice: z.number().min(0).nullable().optional(),
  sellingCurrency: z.string().length(3).nullable().optional(),
  expectedDeliveryDate: z.string().datetime().nullable().optional()
    .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v))),
  consultantId: z.string().nullable().optional(),
});

const BulkUpdateSchema = z.object({
  dealIds: z.array(z.string()).min(1).max(100),
  consultantId: z.string().nullable().optional(),
  statusId: z.string().optional(),
});

@Controller('deals')
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  list(
    @Query('statusId') statusId?: string,
    @Query('locationId') locationId?: string,
    @Query('consultantId') consultantId?: string,
    @Query('country') destinationCountry?: string,
    @Query('payment') payment?: 'UNPAID' | 'PARTIAL' | 'PAID',
    @Query('q') q?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.deals.list({
      statusId,
      locationId,
      consultantId,
      destinationCountry,
      payment,
      q,
      createdFrom,
      createdTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.deals.byId(id);
  }

  @Post()
  @MinRole('CONSULTANT')
  create(@Body() body: any, @CurrentUser() actor: AuthUser) {
    return this.deals.create(body, actor.id);
  }

  @Patch(':id')
  @MinRole('CONSULTANT')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.deals.update(id, DealUpdateSchema.parse(body));
  }

  // Bulk clean-up: assign a consultant and/or set a stage on many deals.
  @Post('bulk')
  @MinRole('CONSULTANT')
  async bulk(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const { dealIds, consultantId, statusId } = BulkUpdateSchema.parse(body);
    let updated = 0;
    for (const id of dealIds) {
      if (consultantId !== undefined) {
        await this.deals.update(id, { consultantId });
      }
      if (statusId) {
        await this.deals.changeStatus(id, statusId, 'Bulk update', actor.id);
      }
      updated++;
    }
    return { updated };
  }

  @Post(':id/status')
  @MinRole('CONSULTANT')
  changeStatus(
    @Param('id') id: string,
    @Body() body: { statusId: string; note?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.deals.changeStatus(id, body.statusId, body.note, actor.id);
  }

  @Post(':id/location')
  @MinRole('CONSULTANT')
  changeLocation(
    @Param('id') id: string,
    @Body() body: { locationId: string; note?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.deals.changeLocation(id, body.locationId, body.note, actor.id);
  }

  @Post(':id/payments')
  @MinRole('CONSULTANT')
  addPayment(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.deals.addPayment(id, body, actor.id);
  }

  @Get(':id/documents')
  listDocuments(@Param('id') id: string) {
    return this.deals.listDocuments(id);
  }

  @Post(':id/documents')
  @MinRole('CONSULTANT')
  addDocument(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.deals.addDocument(id, body, actor.id);
  }

  @Patch(':id/documents/:docId')
  @MinRole('CONSULTANT')
  updateDocument(@Param('id') id: string, @Param('docId') docId: string, @Body() body: any) {
    return this.deals.updateDocument(id, docId, body);
  }

  @Post(':id/notes')
  @MinRole('CONSULTANT')
  addNote(
    @Param('id') id: string,
    @Body() body: { note: string; clientVisible?: boolean },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.deals.addNote(id, body.note, actor.id, body.clientVisible);
  }

  // ── Paperwork files ────────────────────────────────────────────────

  @Post(':id/documents/:docId/file')
  @MinRole('CONSULTANT')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.documents.uploadForType(id, docId, file, actor.id);
  }

  @Get(':id/documents/:docId/url')
  documentUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.documents.getUrl(id, docId);
  }
}
