import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FleetModule } from '../fleet/fleet.module';
import { whatsAppProviderFactory } from '../notifications/whatsapp.provider';
import { AuditPackService } from './audit-pack.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { COMPLIANCE_QUEUE, ComplianceWorker } from './compliance.worker';
import { FatigueService } from './fatigue.service';
import { GovernanceService } from './governance.service';
import { MonthlyReviewService } from './monthly-review.service';

// The expiry engine, the RAG dashboard, RTMS governance records and the audit
// pack. Reuses the existing WhatsApp provider factory rather than a second
// notification path — every reminder still lands as a Notification row.
@Module({
  imports: [FleetModule, BullModule.registerQueue({ name: COMPLIANCE_QUEUE })],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    GovernanceService,
    FatigueService,
    MonthlyReviewService,
    AuditPackService,
    ComplianceWorker,
    whatsAppProviderFactory,
  ],
  exports: [ComplianceService, FatigueService, MonthlyReviewService],
})
export class ComplianceModule implements OnModuleInit {
  constructor(@InjectQueue(COMPLIANCE_QUEUE) private readonly queue: Queue) {}

  // Repeatable-job registration is idempotent, exactly like the existing
  // stalled-deal sweep in NotificationsModule.
  async onModuleInit() {
    await this.queue.add(
      'daily-sweep',
      {},
      { repeat: { pattern: '0 6 * * *' }, removeOnComplete: 20, removeOnFail: 20 },
    );
    // 03:00 on the 1st: last month's safety performance report.
    await this.queue.add(
      'monthly-review',
      {},
      { repeat: { pattern: '0 3 1 * *' }, removeOnComplete: 12, removeOnFail: 12 },
    );
  }
}
