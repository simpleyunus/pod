import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

// Paperwork files: uploaded by staff onto a checklist item, or by the
// customer through their tracking link. Everything is ClamAV-scanned and
// only CLEAN files are ever served — in either direction.
@Injectable()
export class DocumentsService {
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

  private async store(dealId: string, file: Express.Multer.File) {
    const bucket = this.config.get('S3_BUCKET_MEDIA', 'pod-media');
    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `docs/${dealId}/${randomUUID()}.${ext}`;
    await this.storage.upload(file.buffer, bucket, key, file.mimetype);
    return { bucket, key };
  }

  private scanAsync(documentId: string, dealId: string, buffer: Buffer, actorId?: string, label?: string) {
    this.clamav
      .scan(buffer)
      .then(async (verdict) => {
        await this.prisma.document.update({
          where: { id: documentId },
          data: { scanStatus: verdict },
        });
        if (verdict === 'CLEAN') {
          await this.prisma.timelineEvent.create({
            data: {
              dealId,
              type: 'DOCUMENT',
              note: label ?? 'Document uploaded',
              meta: { documentId },
              createdById: actorId,
            },
          });
        }
      })
      .catch(() => {
        this.prisma.document
          .update({ where: { id: documentId }, data: { scanStatus: 'FAILED' } })
          .catch(() => {});
      });
  }

  // Staff: attach a file to an existing checklist item (creates it if the
  // type has no row yet).
  async uploadForType(
    dealId: string,
    docId: string,
    file: Express.Multer.File,
    actorId?: string,
  ) {
    this.validate(file);
    const doc = await this.prisma.document.findFirst({ where: { id: docId, dealId } });
    if (!doc) throw new NotFoundException('Document not found');

    const { bucket, key } = await this.store(dealId, file);
    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        bucket,
        objectKey: key,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        scanStatus: 'PENDING',
        received: true,
      },
    });
    this.scanAsync(doc.id, dealId, file.buffer, actorId, `${doc.type.replace(/_/g, ' ')} uploaded`);
    return updated;
  }

  // Customer: upload through the tracking link. Lands as an OTHER document
  // flagged fromClient, invisible to other customers by definition and
  // reviewed by staff on the deal page.
  async uploadFromClient(dealId: string, file: Express.Multer.File, label?: string) {
    this.validate(file);
    const { bucket, key } = await this.store(dealId, file);
    const doc = await this.prisma.document.create({
      data: {
        dealId,
        type: 'OTHER',
        label: label?.slice(0, 80) || file.originalname,
        bucket,
        objectKey: key,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        scanStatus: 'PENDING',
        fromClient: true,
        received: true,
      },
    });
    this.scanAsync(doc.id, dealId, file.buffer, undefined, `Customer sent: ${doc.label}`);
    return { id: doc.id, filename: doc.filename, status: 'received' };
  }

  // Download URL — staff side. CLEAN files only.
  async getUrl(dealId: string, docId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: docId, dealId } });
    if (!doc?.objectKey || !doc.bucket) throw new NotFoundException('No file attached');
    if (doc.scanStatus !== 'CLEAN') return { url: null, scanStatus: doc.scanStatus };
    const url = await this.storage.getPresignedUrl(doc.bucket, doc.objectKey);
    return { url, scanStatus: doc.scanStatus, filename: doc.filename };
  }
}
