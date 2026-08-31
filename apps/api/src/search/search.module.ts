import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SEARCH_QUEUE } from '../queue/queue.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchWorker } from './search.worker';

@Module({
  imports: [BullModule.registerQueue({ name: SEARCH_QUEUE })],
  controllers: [SearchController],
  providers: [SearchService, SearchWorker],
  exports: [SearchService],
})
export class SearchModule {}
