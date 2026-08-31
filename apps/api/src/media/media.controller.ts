import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import { MediaService } from './media.service';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('deals/:dealId/media')
  @MinRole('CONSULTANT')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('dealId') dealId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.media.upload(dealId, file, actor.id);
  }

  @Get('media/:assetId/url')
  getUrl(@Param('assetId') assetId: string) {
    return this.media.getPresignedUrl(assetId);
  }

  @Get('deals/:dealId/media')
  listForDeal(@Param('dealId') dealId: string) {
    return this.media.listForDeal(dealId);
  }
}
