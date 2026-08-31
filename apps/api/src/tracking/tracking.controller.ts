import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { MinRole, Public } from '../auth/decorators';
import { DocumentsService } from '../deals/documents.service';
import { TrackingService } from './tracking.service';

const UpdateSchema = z.object({
  showPrices: z.boolean().optional(),
  revoke: z.boolean().optional(),
});

@Controller()
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly documents: DocumentsService,
  ) {}

  @Get('deals/:id/tracking-link')
  getForDeal(@Param('id') dealId: string) {
    return this.tracking.getForDeal(dealId);
  }

  @Post('deals/:id/tracking-link')
  @MinRole('CONSULTANT')
  create(@Param('id') dealId: string) {
    return this.tracking.getOrCreate(dealId);
  }

  @Patch('tracking-links/:id')
  @MinRole('CONSULTANT')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.tracking.update(id, UpdateSchema.parse(body));
  }

  // The customer's private page — token is the only credential.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('track/:token')
  publicView(@Param('token') token: string) {
    return this.tracking.publicView(token);
  }

  // Customer sends a document (e.g. proof of payment) through their link.
  // Validated (PDF/photo, ≤15MB), virus-scanned, then reviewed by staff.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } }) // abuse guard on anonymous uploads
  @Post('track/:token/upload')
  @UseInterceptors(FileInterceptor('file'))
  async clientUpload(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    const dealId = await this.tracking.dealIdForToken(token);
    return this.documents.uploadFromClient(dealId, file, label);
  }
}
