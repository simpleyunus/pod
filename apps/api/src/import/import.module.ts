import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SEARCH_QUEUE } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [StorageModule, BullModule.registerQueue({ name: SEARCH_QUEUE })],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
