import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FleetModule } from '../fleet/fleet.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { MAINTENANCE_QUEUE, MaintenanceWorker } from './maintenance.worker';

@Module({
  imports: [FleetModule, BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceWorker],
  exports: [MaintenanceService],
})
export class MaintenanceModule implements OnModuleInit {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.add(
      'sync-plans',
      {},
      { repeat: { pattern: '30 5 * * *' }, removeOnComplete: 20, removeOnFail: 20 },
    );
  }
}
