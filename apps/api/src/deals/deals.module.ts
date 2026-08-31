import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ClamAvModule } from '../clamav/clamav.module';
import { NOTIFY_QUEUE, SEARCH_QUEUE } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DocumentsService } from './documents.service';

@Module({
  imports: [BullModule.registerQueue({ name: SEARCH_QUEUE }), BullModule.registerQueue({ name: NOTIFY_QUEUE }), StorageModule, ClamAvModule],
  controllers: [DealsController],
  providers: [DealsService, DocumentsService],
  exports: [DealsService, DocumentsService],
})
export class DealsModule {}
