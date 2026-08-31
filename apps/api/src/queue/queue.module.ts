import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const SEARCH_QUEUE = 'search-index';
export const NOTIFY_QUEUE = 'notify';
export const REMINDERS_QUEUE = 'reminders';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL', 'redis://localhost:6379') },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: SEARCH_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
