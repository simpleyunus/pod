import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import {
  InspectionCreateSchema, MaintenancePlanSchema, MaintenancePlanUpdateSchema,
  WorkOrderCreateSchema, WorkOrderTransitionSchema, WorkOrderUpdateSchema,
} from './dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('overview')
  overview() {
    return this.maintenance.overview();
  }

  // ── Plans ────────────────────────────────────────────────────────────

  @Get('plans')
  listPlans(@Query('assetId') assetId?: string) {
    return this.maintenance.listPlans(assetId);
  }

  @Post('plans')
  @MinRole('CONSULTANT')
  createPlan(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.maintenance.createPlan(MaintenancePlanSchema.parse(body), actor.id);
  }

  @Patch('plans/:id')
  @MinRole('CONSULTANT')
  updatePlan(@Param('id') id: string, @Body() body: unknown) {
    return this.maintenance.updatePlan(id, MaintenancePlanUpdateSchema.parse(body));
  }

  @Post('plans/sync')
  @MinRole('ADMIN')
  syncPlans() {
    return this.maintenance.syncAllPlans();
  }

  // ── Work orders ──────────────────────────────────────────────────────

  @Get('work-orders')
  listWorkOrders(
    @Query('assetId') assetId?: string,
    @Query('statusCode') statusCode?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    return this.maintenance.listWorkOrders({ assetId, statusCode, openOnly: openOnly === 'true' });
  }

  @Get('work-orders/:id')
  workOrderById(@Param('id') id: string) {
    return this.maintenance.workOrderById(id);
  }

  @Post('work-orders')
  @MinRole('CONSULTANT')
  createWorkOrder(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.maintenance.createWorkOrder(WorkOrderCreateSchema.parse(body), actor.id);
  }

  @Patch('work-orders/:id')
  @MinRole('CONSULTANT')
  updateWorkOrder(@Param('id') id: string, @Body() body: unknown) {
    return this.maintenance.updateWorkOrder(id, WorkOrderUpdateSchema.parse(body));
  }

  // Approving spend is an admin call; the rest of the lifecycle is operational.
  @Post('work-orders/:id/transition')
  @MinRole('CONSULTANT')
  transition(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.maintenance.transitionWorkOrder(id, WorkOrderTransitionSchema.parse(body), actor.id);
  }

  // ── Inspections ──────────────────────────────────────────────────────

  @Get('inspections')
  listInspections(
    @Query('assetId') assetId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('failedOnly') failedOnly?: string,
  ) {
    return this.maintenance.listInspections({ assetId, assignmentId, failedOnly: failedOnly === 'true' });
  }

  @Post('inspections')
  @MinRole('CONSULTANT')
  createInspection(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.maintenance.createInspection(InspectionCreateSchema.parse(body), actor.id);
  }
}
