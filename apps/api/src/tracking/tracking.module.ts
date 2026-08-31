import { Module, forwardRef } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module';
import { StorageModule } from '../storage/storage.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [StorageModule, forwardRef(() => DealsModule)],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
