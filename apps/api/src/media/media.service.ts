import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClamAvService } from '../clamav/clamav.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clamav: ClamAvService,
    private readonly config: ConfigService,
  ) {}

  async upload(dealId: string, file: Express.Multer.File, actorId?: string) {
    if (!file) throw new BadRequestException('No file provided');
    const bucket = this.config.get('S3_BUCKET_MEDIA', 'pod-media');
    const kind: MediaKind = file.mimetype.startsWith('video/') ? 'VIDEO' : 'PHOTO';
    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `${dealId}/${randomUUID()}.${ext}`;

    await this.storage.upload(file.buffer, bucket, key, file.mimetype);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        dealId,
        kind,
        bucket,
        objectKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        scanStatus: 'PENDING',
        uploadedById: actorId,
      },
    });

    // async ClamAV scan — don't block the response
    this.clamav.scan(file.buffer).then(async (verdict) => {
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { scanStatus: verdict },
      });
      if (verdict === 'CLEAN') {
        await this.prisma.timelineEvent.create({
          data: { dealId, type: 'MEDIA', note: `${kind} uploaded`, meta: { assetId: asset.id }, createdById: actorId },
        });
      }
    }).catch(() => {
      this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { scanStatus: 'FAILED' } }).catch(() => {});
    });

    return asset;
  }

  async getPresignedUrl(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.scanStatus !== 'CLEAN') {
      return { url: null, scanStatus: asset.scanStatus };
    }
    const url = await this.storage.getPresignedUrl(asset.bucket, asset.objectKey);
    return { url, scanStatus: asset.scanStatus };
  }

  async listForDeal(dealId: string) {
    return this.prisma.mediaAsset.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
