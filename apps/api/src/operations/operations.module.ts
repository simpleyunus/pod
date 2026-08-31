import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { FleetModule } from '../fleet/fleet.module';
import { GateService } from './gate.service';
import {
  FinesController, IncidentsController, SpeedEventsController, TripsController,
} from './operations.controller';
import { OperationsService } from './operations.service';

// Trips, the compliance gate, load records, incidents, fines and speed events.
// Imports ComplianceModule for FatigueService — the gate's driver-hours check
// and the dashboard's driver-wellness tile are the same code.
@Module({
  imports: [FleetModule, ComplianceModule],
  controllers: [TripsController, IncidentsController, FinesController, SpeedEventsController],
  providers: [OperationsService, GateService],
  exports: [OperationsService, GateService],
})
export class OperationsModule {}
