import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MaintenanceService } from './maintenance.service';

export const MAINTENANCE_QUEUE = 'maintenance';

// Runs at 05:30, half an hour before the compliance sweep, so the SERVICE_DUE
// items it writes are already current when the expiry engine reads them.
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(private readonly maintenance: MaintenanceService) {
    super();
  }

  async process(_job: Job) {
    const res = await this.maintenance.syncAllPlans();
    this.logger.log(`maintenance plans synced: ${res.synced}`);
    return res;
  }
}
