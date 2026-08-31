import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { SageService } from './sage.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, SageService],
  exports: [SageService],
})
export class AccountingModule {}
