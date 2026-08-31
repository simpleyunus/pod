import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { SEARCH_QUEUE } from '../queue/queue.module';
import { StorageService } from '../storage/storage.service';
import { mapRow } from './normalise';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @InjectQueue(SEARCH_QUEUE) private readonly searchQueue: Queue,
  ) {}

  async uploadBatch(file: Express.Multer.File, actorId?: string) {
    if (!file) throw new BadRequestException('No file provided');
    const bucket = this.config.get('S3_BUCKET_DOCS', 'pod-docs');
    const key = `import/${randomUUID()}/${file.originalname}`;
    await this.storage.upload(file.buffer, bucket, key, file.mimetype);

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames;

    const batch = await this.prisma.importBatch.create({
      data: {
        filename: file.originalname,
        bucket,
        objectKey: key,
        status: 'UPLOADED',
        uploadedById: actorId,
      },
    });
    return { batchId: batch.id, sheets };
  }

  async selectSheet(batchId: string, sheetName: string) {
    const batch = await this.getBatch(batchId);
    const buffer = await this.storage.getObject(batch.bucket!, batch.objectKey!);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new BadRequestException(`Sheet '${sheetName}' not found`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headers = (rows[0] as string[]) ?? [];
    await this.prisma.importBatch.update({ where: { id: batchId }, data: { sheetName, status: 'MAPPING' } });
    return { headers };
  }

  async mapColumns(batchId: string, columnMap: Record<string, string>) {
    const batch = await this.getBatch(batchId);
    const buffer = await this.storage.getObject(batch.bucket!, batch.objectKey!);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[batch.sheetName!];
    if (!sheet) throw new BadRequestException('Sheet not set — call select-sheet first');

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    // Delete existing rows if re-mapping
    await this.prisma.importRow.deleteMany({ where: { batchId } });

    const rowData = rows.map((raw, i) => {
      const { mapped, issues, status } = mapRow(raw, columnMap);
      return { batchId, rowIndex: i, raw: raw as any, mapped: mapped as any, issues: issues as any, status };
    });

    await this.prisma.importRow.createMany({ data: rowData });
    await this.prisma.importBatch.update({ where: { id: batchId }, data: { columnMap: columnMap as any, status: 'REVIEW' } });

    const needsReview = rowData.filter((r) => r.status === 'NEEDS_REVIEW').length;
    const pending = rowData.filter((r) => r.status === 'PENDING').length;
    return { total: rowData.length, needsReview, pending };
  }

  async getRows(batchId: string, filters: { status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, filters.pageSize ?? 25);
    const where = { batchId, ...(filters.status && { status: filters.status as any }) };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.importRow.count({ where }),
      this.prisma.importRow.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { rowIndex: 'asc' } }),
    ]);
    return { total, page, pageSize, items };
  }

  async updateRow(batchId: string, rowId: string, mapped: Record<string, unknown>) {
    return this.prisma.importRow.update({
      where: { id: rowId, batchId },
      data: { mapped: mapped as any, status: 'RESOLVED', issues: [] },
    });
  }

  async commitBatch(batchId: string, actorId?: string) {
    const batch = await this.getBatch(batchId);
    const rows = await this.prisma.importRow.findMany({
      where: { batchId, status: { in: ['PENDING', 'RESOLVED'] } },
      orderBy: { rowIndex: 'asc' },
    });

    // Fetch consultants + statuses + locations for name lookups
    const [users, statuses, locations] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, fullName: true } }),
      this.prisma.dealStatus.findMany({ select: { id: true, name: true } }),
      this.prisma.location.findMany({ select: { id: true, name: true } }),
    ]);
    const findByLabel = (arr: { id: string; name: string }[], val: string) =>
      arr.find((a) => a.name.toLowerCase() === String(val ?? '').toLowerCase())?.id;
    const findUserByName = (val: string) =>
      users.find((u) => u.fullName.toLowerCase() === String(val ?? '').toLowerCase())?.id;

    let dealsCreated = 0;
    let clientsCreated = 0;
    let skipped = 0;

    for (const row of rows) {
      const m = row.mapped as Record<string, any>;
      if (!m?.make || !m?.model || !m?.clientFullName) { skipped++; continue; }
      try {
        // Upsert client
        let client = m.phoneE164
          ? await this.prisma.client.findFirst({ where: { phoneE164: m.phoneE164 } })
          : null;
        if (!client) {
          client = await this.prisma.client.create({
            data: { fullName: m.clientFullName, phoneE164: m.phoneE164 ?? null, email: m.email ?? null, country: m.country ?? null },
          });
          clientsCreated++;
        }

        const count = await this.prisma.deal.count();
        const reference = `POD-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
        const consultantId = m.consultantName ? findUserByName(m.consultantName) : undefined;
        const currentStatusId = m.statusName ? findByLabel(statuses, m.statusName) : undefined;

        const deal = await this.prisma.deal.create({
          data: {
            reference,
            clientId: client.id,
            make: m.make,
            model: m.model,
            year: m.year ?? null,
            colour: m.colour ?? null,
            vin: m.vin ?? null,
            registrationNo: m.registrationNo ?? null,
            supplier: m.supplier ?? null,
            destinationCountry: m.destinationCountry ?? null,
            destinationCity: m.destinationCity ?? null,
            sellingPrice: m.sellingPrice ?? null,
            sellingCurrency: m.sellingCurrency ?? null,
            expectedDeliveryDate: m.expectedDeliveryDate ? new Date(m.expectedDeliveryDate) : null,
            consultantId: consultantId ?? null,
            currentStatusId: currentStatusId ?? null,
            timeline: {
              create: { type: 'SYSTEM', note: `Imported from batch ${batchId} (row ${row.rowIndex + 1})`, meta: { batchId }, createdById: actorId },
            },
          },
        });

        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'COMMITTED', dealId: deal.id } });
        await this.searchQueue.add('index-deal', { dealId: deal.id });
        dealsCreated++;
      } catch {
        skipped++;
      }
    }

    await this.prisma.importBatch.update({ where: { id: batchId }, data: { status: 'COMMITTED', committedAt: new Date() } });
    return { dealsCreated, clientsCreated, skipped };
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException(`Import batch ${batchId} not found`);
    return batch;
  }

  async getBatchById(batchId: string) {
    const batch = await this.getBatch(batchId);
    const counts = await this.prisma.importRow.groupBy({ by: ['status'], where: { batchId }, _count: { status: true } });
    const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.status]));
    return { ...batch, rowCounts: countMap };
  }
}
