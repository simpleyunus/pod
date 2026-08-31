import { Module } from '@nestjs/common';
import { ClamAvModule } from '../clamav/clamav.module';
import { StorageModule } from '../storage/storage.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [StorageModule, ClamAvModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
