import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import {
  AssignmentCreateSchema, AssignmentUpdateSchema, CorrectiveActionSchema,
  CorrectiveActionUpdateSchema, FineSchema, IncidentCreateSchema,
  IncidentInvestigationSchema, MassRecordSchema, PodCaptureSchema,
  SpeedEventSchema, StartTripSchema,
} from './dto';
import { GateService } from './gate.service';
import { OperationsService } from './operations.service';

// Trips live under /api/trips; the incident, fine and speed registers hang off
// the same module because they are all operational records of a journey.
@Controller('trips')
export class TripsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly gate: GateService,
  ) {}

  @Get()
  list(
    @Query('statusCode') statusCode?: string,
    @Query('assetId') assetId?: string,
    @Query('driverId') driverId?: string,
    @Query('dealId') dealId?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    return this.ops.listAssignments({ statusCode, assetId, driverId, dealId, openOnly: openOnly === 'true' });
  }

  @Get('mass-summary')
  massSummary(@Query('months') months?: string) {
    return this.ops.massSummary(Math.min(36, Math.max(1, Number(months) || 12)));
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.ops.assignmentById(id);
  }

  @Post()
  @MinRole('CONSULTANT')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.createAssignment(AssignmentCreateSchema.parse(body), actor.id);
  }

  @Patch(':id')
  @MinRole('CONSULTANT')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.updateAssignment(id, AssignmentUpdateSchema.parse(body), actor.id);
  }

  // Dry run: what would block this trip right now?
  @Get(':id/gate')
  checkGate(@Param('id') id: string) {
    return this.gate.evaluate(id);
  }

  @Post(':id/gate')
  @MinRole('CONSULTANT')
  runGate(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.ops.runGate(id, actor.id);
  }

  // Departure. Blocks on failure; an override needs ADMIN plus a reason.
  @Post(':id/start')
  @MinRole('CONSULTANT')
  start(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.startTrip(id, StartTripSchema.parse(body ?? {}), actor);
  }

  @Post(':id/pod')
  @MinRole('CONSULTANT')
  capturePod(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.capturePod(id, PodCaptureSchema.parse(body), actor.id);
  }

  @Post(':id/mass')
  @MinRole('CONSULTANT')
  recordMass(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.recordMass(id, MassRecordSchema.parse(body), actor.id);
  }
}

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly ops: OperationsService) {}

  @Get()
  list(
    @Query('openOnly') openOnly?: string,
    @Query('assetId') assetId?: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.ops.listIncidents({ openOnly: openOnly === 'true', assetId, driverId });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.ops.incidentById(id);
  }

  @Post()
  @MinRole('CONSULTANT')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.createIncident(IncidentCreateSchema.parse(body), actor.id);
  }

  @Post(':id/investigation')
  @MinRole('CONSULTANT')
  investigate(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.recordInvestigation(id, IncidentInvestigationSchema.parse(body), actor.id);
  }

  @Post(':id/actions')
  @MinRole('CONSULTANT')
  addAction(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.addCorrectiveAction(id, CorrectiveActionSchema.parse(body), actor.id);
  }

  @Patch('actions/:actionId')
  @MinRole('CONSULTANT')
  updateAction(@Param('actionId') actionId: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.updateCorrectiveAction(actionId, CorrectiveActionUpdateSchema.parse(body), actor.id);
  }
}

@Controller('fines')
export class FinesController {
  constructor(private readonly ops: OperationsService) {}

  @Get()
  list(
    @Query('assetId') assetId?: string,
    @Query('driverId') driverId?: string,
    @Query('unpaidOnly') unpaidOnly?: string,
  ) {
    return this.ops.listFines({ assetId, driverId, unpaidOnly: unpaidOnly === 'true' });
  }

  @Post()
  @MinRole('CONSULTANT')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.ops.createFine(FineSchema.parse(body), actor.id);
  }

  @Patch(':id')
  @MinRole('CONSULTANT')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.ops.updateFine(id, FineSchema.partial().parse(body));
  }
}

@Controller('speed-events')
export class SpeedEventsController {
  constructor(private readonly ops: OperationsService) {}

  @Get()
  list(@Query('assetId') assetId?: string, @Query('driverId') driverId?: string) {
    return this.ops.listSpeedEvents({ assetId, driverId });
  }

  @Post()
  @MinRole('CONSULTANT')
  create(@Body() body: unknown) {
    return this.ops.createSpeedEvent(SpeedEventSchema.parse(body));
  }
}
