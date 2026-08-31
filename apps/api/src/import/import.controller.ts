import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import { ImportService } from './import.service';

@Controller('import')
@MinRole('ADMIN')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: AuthUser) {
    return this.importService.uploadBatch(file, actor.id);
  }

  @Get(':batchId')
  getBatch(@Param('batchId') batchId: string) {
    return this.importService.getBatchById(batchId);
  }

  @Post(':batchId/select-sheet')
  selectSheet(@Param('batchId') batchId: string, @Body() body: { sheetName: string }) {
    return this.importService.selectSheet(batchId, body.sheetName);
  }

  @Post(':batchId/map')
  mapColumns(@Param('batchId') batchId: string, @Body() body: { columnMap: Record<string, string> }) {
    return this.importService.mapColumns(batchId, body.columnMap);
  }

  @Get(':batchId/rows')
  getRows(
    @Param('batchId') batchId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.importService.getRows(batchId, { status, page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined });
  }

  @Patch(':batchId/rows/:rowId')
  updateRow(
    @Param('batchId') batchId: string,
    @Param('rowId') rowId: string,
    @Body() body: { mapped: Record<string, unknown> },
  ) {
    return this.importService.updateRow(batchId, rowId, body.mapped);
  }

  @Post(':batchId/commit')
  commit(@Param('batchId') batchId: string, @CurrentUser() actor: AuthUser) {
    return this.importService.commitBatch(batchId, actor.id);
  }
}
