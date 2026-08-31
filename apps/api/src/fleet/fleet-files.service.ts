import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FleetFileKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClamAvService } from '../clamav/clamav.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];
const MAX_BYTES = 15 * 1024 * 1024;

// Fleet attachments: compliance certificates, inspection and incident photos,
// POD signatures, weighbridge slips, generated report PDFs.
//
// Document and MediaAsset both require a dealId, so the fleet module needs its
// own blob table — but the machinery is the existing one: StorageService for
// MinIO and the same fire-and-forget ClamAV scan, with the same rule that only
// CLEAN files are ever served.
@Injectable()
export class FleetFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clamav: ClamAvService,
    private readonly config: ConfigService,
  ) {}

  private validate(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF and photo files are accepted');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File is larger than 15 MB');
    }
  }

  private bucket() {
    return this.config.get('S3_BUCKET_MEDIA', 'pod-media');
  }

  private prefix(kind: FleetFileKind) {
    return `fleet/${kind.toLowerCase()}`;
  }

  private scanAsync(fileId: string, buffer: Buffer) {
    this.clamav
      .scan(buffer)
      .then((verdict) =>
        this.prisma.fleetFile.update({ where: { id: fileId }, data: { scanStatus: verdict } }),
      )
      .catch(() => {
        this.prisma.fleetFile
          .update({ where: { id: fileId }, data: { scanStatus: 'FAILED' } })
          .catch(() => {});
      });
  }

  async upload(file: Express.Multer.File, kind: FleetFileKind, actorId?: string) {
    this.validate(file);
    const bucket = this.bucket();
    const ext = file.originalname?.split('.').pop() ?? 'bin';
    const key = `${this.prefix(kind)}/${randomUUID()}.${ext}`;
    await this.storage.upload(file.buffer, bucket, key, file.mimetype);

    const record = await this.prisma.fleetFile.create({
      data: {
        kind,
        bucket,
        objectKey: key,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: actorId,
      },
    });
    this.scanAsync(record.id, file.buffer);
    return record;
  }

  // Server-generated content (report PDFs) skips ClamAV — we produced the
  // bytes ourselves, so there is nothing to scan for.
  async storeGenerated(buffer: Buffer, kind: FleetFileKind, filename: string, mimeType = 'application/pdf', actorId?: string) {
    const bucket = this.bucket();
    const key = `${this.prefix(kind)}/${randomUUID()}-${filename}`;
    await this.storage.upload(buffer, bucket, key, mimeType);
    return this.prisma.fleetFile.create({
      data: {
        kind,
        bucket,
        objectKey: key,
        filename,
        mimeType,
        sizeBytes: buffer.length,
        scanStatus: 'CLEAN',
        uploadedById: actorId,
      },
    });
  }

  async getUrl(fileId: string) {
    const file = await this.prisma.fleetFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    if (file.scanStatus !== 'CLEAN') {
      return { url: null, scanStatus: file.scanStatus, filename: file.filename };
    }
    const url = await this.storage.getPresignedUrl(file.bucket, file.objectKey);
    return { url, scanStatus: file.scanStatus, filename: file.filename };
  }

  // Resolve many file ids at once — fleet records reference FleetFile by plain
  // id column, so lists need a batch lookup rather than a Prisma include.
  async byIds(ids: (string | null | undefined)[]) {
    const clean = [...new Set(ids.filter((x): x is string => !!x))];
    if (!clean.length) return new Map<string, any>();
    const files = await this.prisma.fleetFile.findMany({ where: { id: { in: clean } } });
    return new Map(files.map((f) => [f.id, f]));
  }
}
