import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ComplianceService } from './compliance.service';
import { MonthlyReviewService } from './monthly-review.service';

export const COMPLIANCE_QUEUE = 'compliance';

// The expiry engine. Same shape as the existing RemindersWorker: a BullMQ
// repeatable job rather than a new scheduler dependency.
@Processor(COMPLIANCE_QUEUE)
export class ComplianceWorker extends WorkerHost {
  private readonly logger = new Logger(ComplianceWorker.name);

  constructor(
    private readonly compliance: ComplianceService,
    private readonly reviews: MonthlyReviewService,
  ) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case 'daily-sweep': {
        // Recompute first, then remind — so reminders always reflect the
        // status the dashboard is showing.
        const recompute = await this.compliance.recomputeStatuses();
        const reminders = await this.compliance.sendReminders();
        this.logger.log(
          `sweep: checked=${recompute.checked} changed=${recompute.changed} ` +
            `reminders sent=${reminders.sent} skipped=${reminders.skipped}`,
        );
        return { recompute, reminders };
      }
      case 'monthly-review': {
        const review = await this.reviews.generate();
        this.logger.log(`monthly review ${review.periodMonth} generated`);
        return { periodMonth: review.periodMonth };
      }
      default:
        this.logger.warn(`unknown job ${job.name}`);
        return null;
    }
  }
}
