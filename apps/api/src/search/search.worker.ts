import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SEARCH_QUEUE } from '../queue/queue.module';
import { SearchService } from './search.service';

@Processor(SEARCH_QUEUE)
export class SearchWorker extends WorkerHost {
  constructor(
    private readonly search: SearchService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'index-deal') {
      const deal = await this.prisma.deal.findUnique({
        where: { id: job.data.dealId },
        include: {
          client: { select: { id: true, fullName: true } },
          currentStatus: { select: { id: true, name: true } },
          currentLocation: { select: { id: true, name: true } },
          consultant: { select: { id: true, fullName: true } },
        },
      });
      if (deal) await this.search.indexDeal(deal);
    }
  }
}
