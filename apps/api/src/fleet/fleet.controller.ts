import {
  Body, Controller, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FleetFileKind } from '@prisma/client';
import { z } from 'zod';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import {
  AssetCreateSchema, AssetUpdateSchema, CarrierCreateSchema, CarrierUpdateSchema,
  DriverCreateSchema, DriverUpdateSchema, LookupUpsertSchema, OdometerSchema, TyreRecordSchema,
} from './dto';
import { FleetFilesService } from './fleet-files.service';
import { FleetService } from './fleet.service';

const asBool = (v?: string) => v === 'true' || v === '1';

// Read is open to any signed-in user; writes need CONSULTANT; lookup edits and
// anything that changes what the compliance gate enforces need ADMIN.
@Controller('fleet')
export class FleetController {
  constructor(
    private readonly fleet: FleetService,
    private readonly files: FleetFilesService,
  ) {}

  // ── Lookups ──────────────────────────────────────────────────────────

  @Get('lookups')
  lookups() {
    return this.fleet.lookups();
  }

  @Post('lookups/:table')
  @MinRole('ADMIN')
  createLookup(@Param('table') table: string, @Body() body: unknown) {
    return this.fleet.createLookup(table, LookupUpsertSchema.parse(body));
  }

  @Patch('lookups/:table/:id')
  @MinRole('ADMIN')
  updateLookup(@Param('table') table: string, @Param('id') id: string, @Body() body: unknown) {
    return this.fleet.updateLookup(table, id, LookupUpsertSchema.parse(body));
  }

  // ── Assets ───────────────────────────────────────────────────────────

  @Get('assets')
  listAssets(
    @Query('q') q?: string,
    @Query('typeId') typeId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.fleet.listAssets({ q, typeId, includeInactive: asBool(includeInactive) });
  }

  @Get('assets/:id')
  assetById(@Param('id') id: string) {
    return this.fleet.assetById(id);
  }

  @Post('assets')
  @MinRole('CONSULTANT')
  createAsset(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.fleet.createAsset(AssetCreateSchema.parse(body), actor.id);
  }

  @Patch('assets/:id')
  @MinRole('CONSULTANT')
  updateAsset(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.fleet.updateAsset(id, AssetUpdateSchema.parse(body), actor.id);
  }

  @Post('assets/:id/odometer')
  @MinRole('CONSULTANT')
  odometer(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const { odometerKm } = OdometerSchema.parse(body);
    return this.fleet.recordOdometer(id, odometerKm, actor.id);
  }

  // ── Drivers ──────────────────────────────────────────────────────────

  @Get('drivers')
  listDrivers(@Query('q') q?: string, @Query('includeInactive') includeInactive?: string) {
    return this.fleet.listDrivers({ q, includeInactive: asBool(includeInactive) });
  }

  @Get('drivers/:id')
  driverById(@Param('id') id: string) {
    return this.fleet.driverById(id);
  }

  @Post('drivers')
  @MinRole('CONSULTANT')
  createDriver(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.fleet.createDriver(DriverCreateSchema.parse(body), actor.id);
  }

  @Patch('drivers/:id')
  @MinRole('CONSULTANT')
  updateDriver(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.fleet.updateDriver(id, DriverUpdateSchema.parse(body), actor.id);
  }

  // ── Carriers ─────────────────────────────────────────────────────────

  @Get('carriers')
  listCarriers(@Query('includeInactive') includeInactive?: string) {
    return this.fleet.listCarriers(asBool(includeInactive));
  }

  @Get('carriers/:id')
  carrierById(@Param('id') id: string) {
    return this.fleet.carrierById(id);
  }

  @Post('carriers')
  @MinRole('CONSULTANT')
  createCarrier(@Body() body: unknown) {
    return this.fleet.createCarrier(CarrierCreateSchema.parse(body));
  }

  @Patch('carriers/:id')
  @MinRole('CONSULTANT')
  updateCarrier(@Param('id') id: string, @Body() body: unknown) {
    return this.fleet.updateCarrier(id, CarrierUpdateSchema.parse(body));
  }

  // ── Tyre record (R12) ────────────────────────────────────────────────

  @Get('tyres')
  listTyres(@Query('assetId') assetId?: string) {
    return this.fleet.listTyres(assetId);
  }

  @Post('tyres')
  @MinRole('CONSULTANT')
  addTyre(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.fleet.addTyreRecord(TyreRecordSchema.parse(body), actor.id);
  }

  // ── Files ────────────────────────────────────────────────────────────

  @Post('files')
  @MinRole('CONSULTANT')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: string,
    @CurrentUser() actor: AuthUser,
  ) {
    const parsed = z
      .enum([
        'COMPLIANCE_DOC', 'INSPECTION_PHOTO', 'INCIDENT_PHOTO', 'POD_SIGNATURE',
        'POD_PHOTO', 'WORK_ORDER_DOC', 'MASS_CERTIFICATE', 'POLICY_DOC', 'REPORT_PDF',
      ])
      .parse(kind);
    return this.files.upload(file, parsed as FleetFileKind, actor.id);
  }

  @Get('files/:id/url')
  fileUrl(@Param('id') id: string) {
    return this.files.getUrl(id);
  }
}
