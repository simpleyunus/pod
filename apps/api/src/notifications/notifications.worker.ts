import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFY_QUEUE, REMINDERS_QUEUE } from '../queue/queue.module';
import { NotificationsService } from './notifications.service';

@Processor(NOTIFY_QUEUE)
export class NotifyWorker extends WorkerHost {
  private readonly logger = new Logger(NotifyWorker.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<{ dealId: string }>) {
    const n = await this.notifications.notifyDealUpdate(job.data.dealId);
    this.logger.log(`deal ${job.data.dealId} → ${n.status}`);
    return { status: n.status };
  }
}

@Processor(REMINDERS_QUEUE)
export class RemindersWorker extends WorkerHost {
  private readonly logger = new Logger(RemindersWorker.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(_job: Job) {
    const res = await this.notifications.createStalledReminders();
    this.logger.log(`stalled=${res.stalled} reminders=${res.remindersCreated}`);
    return res;
  }
}
