import { Module } from '@nestjs/common';
import { ClamAvModule } from '../clamav/clamav.module';
import { StorageModule } from '../storage/storage.module';
import { FleetController } from './fleet.controller';
import { FleetEventsService } from './fleet-events.service';
import { FleetFilesService } from './fleet-files.service';
import { FleetService } from './fleet.service';

// Assets, drivers, carriers, tyre records and the module's shared primitives:
// FleetFilesService (MinIO + ClamAV) and FleetEventsService (append-only
// trail). Compliance, maintenance and operations all import this module.
@Module({
  imports: [StorageModule, ClamAvModule],
  controllers: [FleetController],
  providers: [FleetService, FleetFilesService, FleetEventsService],
  exports: [FleetService, FleetFilesService, FleetEventsService],
})
export class FleetModule {}
