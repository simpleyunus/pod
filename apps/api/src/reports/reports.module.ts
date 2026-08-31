import { Controller, Get, Module, Query } from '@nestjs/common';
import { MinRole } from '../auth/decorators';
import { ReportsService } from './reports.service';

@Controller('reports')
@MinRole('CONSULTANT')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query('months') months?: string) {
    const m = Math.min(36, Math.max(1, Number(months) || 12));
    return this.reports.summary(m);
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
