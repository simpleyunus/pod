import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getForDeal(dealId: string) {
    return this.prisma.trackingLink.findFirst({
      where: { dealId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrCreate(dealId: string) {
    const existing = await this.getForDeal(dealId);
    if (existing) return existing;

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, clientId: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);

    return this.prisma.trackingLink.create({
      data: {
        dealId,
        clientId: deal.clientId,
        token: randomBytes(24).toString('base64url'),
      },
    });
  }

  async update(id: string, data: { showPrices?: boolean; revoke?: boolean }) {
    const link = await this.prisma.trackingLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException();
    return this.prisma.trackingLink.update({
      where: { id },
      data: {
        ...(data.showPrices !== undefined && { showPrices: data.showPrices }),
        ...(data.revoke && { revokedAt: new Date() }),
      },
    });
  }

  // The customer-facing payload. Only ever expose what POD chose to share:
  // no cost prices, no supplier detail, no other customers, selling figures
  // only when showPrices is on.
  async publicView(token: string) {
    const link = await this.prisma.trackingLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date()) || !link.dealId) {
      throw new NotFoundException('This tracking link is no longer active');
    }

    const [deal, stages] = await Promise.all([
      this.prisma.deal.findUnique({
        where: { id: link.dealId },
        include: {
          client: { select: { fullName: true } },
          consultant: { select: { fullName: true } },
          currentStatus: true,
          currentLocation: true,
          payments: { select: { amount: true, currency: true } },
          media: { where: { scanStatus: 'CLEAN' }, orderBy: { createdAt: 'desc' }, take: 12 },
          timeline: {
            where: {
              OR: [
                { type: { in: ['STATUS_CHANGE', 'LOCATION_CHANGE'] } },
                // staff notes explicitly marked for the customer
                { type: 'NOTE', meta: { path: ['clientVisible'], equals: true } },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { status: true, location: true },
          },
          documents: {
            where: { visibleToClient: true, scanStatus: 'CLEAN', objectKey: { not: null } },
            orderBy: { updatedAt: 'desc' },
          },
        },
      }),
      this.prisma.dealStatus.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    if (!deal) throw new NotFoundException('This tracking link is no longer active');

    await this.prisma.trackingLink.update({
      where: { id: link.id },
      data: { lastAccessAt: new Date() },
    });

    const photos = await Promise.all(
      deal.media.map(async (m) => ({
        kind: m.kind,
        url: await this.storage.getPresignedUrl(m.bucket, m.objectKey),
      })),
    );

    const documents = await Promise.all(
      deal.documents.map(async (doc) => ({
        label: doc.label ?? doc.type.replace(/_/g, ' '),
        filename: doc.filename,
        url: await this.storage.getPresignedUrl(doc.bucket!, doc.objectKey!),
      })),
    );

    const paid = deal.payments.reduce((s, p) => s + Number(p.amount), 0);
    const price = deal.sellingPrice ? Number(deal.sellingPrice) : null;

    return {
      clientFirstName: deal.client.fullName.split(' ')[0],
      reference: deal.reference,
      car: { make: deal.make, model: deal.model, year: deal.year, colour: deal.colour },
      stages: stages.map((s) => s.name),
      currentStageIndex: deal.currentStatusId
        ? stages.findIndex((s) => s.id === deal.currentStatusId)
        : -1,
      whereItIs: deal.currentLocation?.name ?? null,
      destination: [deal.destinationCity, deal.destinationCountry].filter(Boolean).join(', ') || null,
      expectedDelivery: deal.expectedDeliveryDate,
      consultant: deal.consultant?.fullName ?? null,
      prices: link.showPrices
        ? { sellingPrice: price, currency: deal.sellingCurrency, paid, balance: price !== null ? price - paid : null }
        : null,
      photos,
      documents,
      notes: deal.timeline
        .filter((ev) => ev.type === 'NOTE')
        .map((ev) => ({ at: ev.createdAt, text: ev.note })),
      updates: deal.timeline
        .filter((ev) => ev.type !== 'NOTE')
        .map((ev) => ({
          at: ev.createdAt,
          text: ev.type === 'STATUS_CHANGE' ? ev.status?.name : `Arrived: ${ev.location?.name}`,
        })),
    };
  }

  // Resolve a live token to its deal — the guard for customer uploads.
  async dealIdForToken(token: string) {
    const link = await this.prisma.trackingLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date()) || !link.dealId) {
      throw new NotFoundException('This tracking link is no longer active');
    }
    return link.dealId;
  }
}
