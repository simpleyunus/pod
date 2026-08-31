import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NOTIFY_QUEUE, REMINDERS_QUEUE } from '../queue/queue.module';
import { TrackingModule } from '../tracking/tracking.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotifyWorker, RemindersWorker } from './notifications.worker';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { whatsAppProviderFactory } from './whatsapp.provider';

@Module({
  imports: [
    TrackingModule,
    BullModule.registerQueue({ name: NOTIFY_QUEUE }),
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
  ],
  controllers: [NotificationsController, WhatsAppWebhookController],
  providers: [NotificationsService, NotifyWorker, RemindersWorker, whatsAppProviderFactory],
  exports: [NotificationsService, BullModule],
})
export class NotificationsModule implements OnModuleInit {
  constructor(@InjectQueue(REMINDERS_QUEUE) private readonly reminders: Queue) {}

  // Daily 07:00 stalled-deal sweep; repeatable job registration is idempotent.
  async onModuleInit() {
    await this.reminders.add(
      'stalled-sweep',
      {},
      { repeat: { pattern: '0 7 * * *' }, removeOnComplete: 20, removeOnFail: 20 },
    );
  }
}
